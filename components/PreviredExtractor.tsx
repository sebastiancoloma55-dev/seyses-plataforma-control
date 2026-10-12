"use client";

import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

type PositionedItem = { str:string; x:number; y:number; width:number };
type VisualLine = { y:number; items:PositionedItem[] };
type PreviredRow = Record<string,string|number>;

const COLUMNS = [
  "RUT", "Nombre PDF", "AFP", "Salud", "Renta Seguro Social", "Monto Seguro Social",
  "Renta AFP", "Cotizacion AFP", "SIS AFP", "APVI", "Renta AFC", "AFC Afiliado",
  "AFC Empleador", "Renta Salud", "Cotizacion Salud", "Renta Mutual",
  "Cotizacion Mutual", "Renta Caja Isapre", "Renta Caja No Isapre", "Cotizacion Caja"
] as const;
type MutablePreviredRow = Record<string,string|number>;

function normalize(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
}
function formatRut(value:string) {
  const raw=value.replace(/\s/g,"").toUpperCase();
  const match=raw.match(/^(\d{1,2}\.?\d{3}\.?\d{3})-?([\dK])$/);
  if (!match) return raw;
  const digits=match[1].replace(/\./g,"");
  return digits.slice(0,-6)+"."+digits.slice(-6,-3)+"."+digits.slice(-3)+"-"+match[2];
}
function newRow(rut:string,name=""):MutablePreviredRow {
  return {
    "RUT":formatRut(rut),"Nombre PDF":name,"AFP":"","Salud":"",
    "Renta Seguro Social":0,"Monto Seguro Social":0,"Renta AFP":0,"Cotizacion AFP":0,
    "SIS AFP":0,"APVI":0,"Renta AFC":0,"AFC Afiliado":0,"AFC Empleador":0,
    "Renta Salud":0,"Cotizacion Salud":0,"Renta Mutual":0,"Cotizacion Mutual":0,
    "Renta Caja Isapre":0,"Renta Caja No Isapre":0,"Cotizacion Caja":0,"_Renta_Caja_Base":0
  };
}
function parseMoney(value:string) {
  const raw=value.replace(/\$/g,"").replace(/\s/g,"").trim();
  if (!raw) return 0;
  const n=Number(raw.replace(/\./g,"").replace(/,/g,"."));
  return Number.isFinite(n)?Math.round(n):0;
}
function linesFromItems(items:PositionedItem[]) {
  const sorted=[...items].sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines:VisualLine[]=[];
  for(const item of sorted) {
    let line=lines.find(x=>Math.abs(x.y-item.y)<=4.5);
    if(!line){line={y:item.y,items:[]};lines.push(line);}
    line.items.push(item);line.items.sort((a,b)=>a.x-b.x);
    line.y=line.items.reduce((sum,current)=>sum+current.y,0)/line.items.length;
  }
  return lines.sort((a,b)=>b.y-a.y);
}
async function readPdf(file:File) {
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let allText="";
  let textPages=0;
  try {
    for(let pageNum=1;pageNum<=pdf.numPages;pageNum++) {
      const page=await pdf.getPage(pageNum);
      const content=await page.getTextContent();
      const source=content.items as unknown as Array<{str?:unknown;transform?:unknown;width?:unknown}>;
      const items:PositionedItem[]=source.filter(item=>typeof item.str==="string"&&(item.str as string).trim()&&Array.isArray(item.transform)).map(item=>{
        const t=item.transform as number[];
        return {str:(item.str as string).trim(),x:Number(t[4])||0,y:Number(t[5])||0,width:Number(item.width)||0};
      });
      if(!items.length)continue;
      textPages++;
      allText+=linesFromItems(items).map(line=>line.items.map(item=>item.str).join(" ")).join("\n")+"\n";
    }
  } finally { await pdf.destroy(); }
  if(!textPages||!allText.trim()) throw new Error("El PDF no contiene texto seleccionable. Los PDF escaneados requieren OCR; descarga el PDF digital desde Previred.");
  return allText;
}
function parseCertificate(text:string):MutablePreviredRow[] {
  const results=new Map<string,MutablePreviredRow>();
  const chunks=text.split(/Que,\s*las\s*cotizaciones\s*previsionales\s*del\s*Sr\.?\s*\(a\)/i).slice(1);
  const months="Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre";
  const contribution=new RegExp("^(.+?)\\s+("+months+")\\s+(\\d{4})\\s+(REM|GRA|RET|LEY|COM)\\s+\\$?([\\d.]+)\\s+\\$?([\\d.]+)\\s*$","i");
  for(const chunk of chunks) {
    const info=chunk.match(/([\s\S]*?),\s*Rut\s*:\s*([\d.\-kK]+)/i);
    if(!info)continue;
    const name=info[1].replace(/\s+/g," ").replace(/^[\s:,.]+|[\s:,.]+$/g,"").trim();
    const rut=formatRut(info[2]);
    if(!rut)continue;
    const row=results.get(rut)||newRow(rut,name);
    if(name.length>String(row["Nombre PDF"]).length)row["Nombre PDF"]=name;
    const lines=chunk.split(/\r?\n/).map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean);
    for(const line of lines) {
      const match=line.match(contribution);
      if(!match)continue;
      const institution=normalize(match[1]);
      const base=parseMoney(match[5]), amount=parseMoney(match[6]);
      if(institution.includes("SEGURO SOCIAL")){row["Renta Seguro Social"]=base;row["Monto Seguro Social"]=amount;}
      else if(institution.includes("OBLIGATORIA")){row["AFP"]="AFP "+institution.replace("(COTIZACION OBLIGATORIA","").replace(")","").trim();row["Renta AFP"]=base;row["Cotizacion AFP"]=amount;}
      else if(institution.includes("(SIS)")||institution.endsWith(" SIS"))row["SIS AFP"]=amount;
      else if(institution.includes("APVI"))row["APVI"]=amount;
      else if(institution.includes("(AFC)")||institution.endsWith(" AFC")){row["Renta AFC"]=base;row["AFC Empleador"]=amount;}
      else if(["FONASA","ISAPRE","MASVIDA","CRUZ BLANCA","CONSALUD","COLMENA","BANMEDICA","NUEVA MASVIDA"].some(name=>institution.includes(name))){row["Salud"]=institution;row["Renta Salud"]=base;row["Cotizacion Salud"]=amount;}
      else if(["MUTUAL","ACHS","IST","ISL"].some(name=>institution.includes(name))){row["Renta Mutual"]=base;row["Cotizacion Mutual"]=amount;}
      else if(["CAJA","HEROES","ANDES"].some(name=>institution.includes(name))){row["Cotizacion Caja"]=amount;if(String(row["Salud"]).includes("ISAPRE"))row["Renta Caja Isapre"]=base;else row["Renta Caja No Isapre"]=base;}
    }
    results.set(rut,row);
  }
  return [...results.values()];
}
function parsePlanilla(text:string):MutablePreviredRow[] {
  const result=new Map<string,MutablePreviredRow>();
  const pages=text.split(/\f/);
  for(const page of pages) {
    const upper=normalize(page);
    let context="UNKNOWN";
    let currentAfp="AFP";
    if(upper.includes("FONDO DE PENSIONES")&&upper.includes("AFP")) {
      context="AFP";
      const match=page.match(/AFP\s+([A-Za-zÁÉÍÓÚÑ]+)/i);
      if(match)currentAfp="AFP "+match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase();
    } else if(upper.includes("SEGURO SOCIAL PREVISIONAL"))context="SEGURO";
    else if(upper.includes("FONASA")||upper.includes("PLANILLA DE DECLARACION Y PAGO SIMULTANEO"))context="FONASA";
    else if(upper.includes("ISAPRE")) {
      context="ISAPRE";
      const match=page.match(/ISAPRE\s+([A-Za-zÁÉÍÓÚÑ]+)/i);
      if(match)context="ISAPRE "+match[1].charAt(0).toUpperCase()+match[1].slice(1).toLowerCase();
    } else if(upper.includes("MUTUAL DE SEGURIDAD")||upper.includes("ACHS")||upper.includes("INSTITUTO DE SEGURIDAD"))context="MUTUAL";
    else if(upper.includes("CAJA DE COMPENSACION")||upper.includes("LOS HEROES")||upper.includes("LOS ANDES"))context="CAJA";

    for(const originalLine of page.split(/\r?\n/)) {
      const line=originalLine.replace(/\s+/g," ").trim();
      const rutMatch=line.match(/\b(?:\d{1,2}(?:\.\d{3}){2}|\d{7,8})-[\dKk]\b/);
      if(!rutMatch)continue;
      const rut=formatRut(rutMatch[0]);
      const idx=line.indexOf(rutMatch[0])+rutMatch[0].length;
      const rest=line.slice(idx).trim();
      const row=result.get(rut)||newRow(rut);
      const name=rest.replace(/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/g," ").replace(/\s+/g," ").trim().replace(/(?:AFP|JC)\s*$/i,"").trim();
      if(name.length>String(row["Nombre PDF"]).length)row["Nombre PDF"]=name;
      const amounts=(rest.match(/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/g)||[]).map(v=>parseMoney(v)).filter(v=>v>1000);
      if(amounts.length) {
        if(context==="SEGURO"){row["Renta Seguro Social"]=amounts[0];if(amounts.length>1)row["Monto Seguro Social"]=amounts[1];}
        else if(context==="AFP") {
          row["AFP"]=currentAfp;if(amounts.length>0)row["Renta AFP"]=amounts[0];if(amounts.length>1)row["Cotizacion AFP"]=amounts[1];if(amounts.length>2)row["SIS AFP"]=amounts[2];
          if(amounts.length>=5){row["Renta AFC"]=amounts[3];row["AFC Empleador"]=amounts[4];}
          else if(amounts.length>=4){row["Renta AFC"]=amounts[0];row["AFC Empleador"]=amounts[amounts.length-1];}
        } else if(context==="FONASA"){row["Salud"]="FONASA";row["Renta Salud"]=amounts[0];if(amounts.length>1)row["Cotizacion Salud"]=amounts[1];}
        else if(context.startsWith("ISAPRE")){row["Salud"]=context;row["Renta Salud"]=amounts[0];if(amounts.length>1)row["Cotizacion Salud"]=amounts[1];}
        else if(context==="MUTUAL"){row["Renta Mutual"]=amounts[0];if(amounts.length>1)row["Cotizacion Mutual"]=amounts[1];}
        else if(context==="CAJA"){row["_Renta_Caja_Base"]=amounts[0];if(amounts.length>1)row["Cotizacion Caja"]=amounts[1];}
      }
      result.set(rut,row);
    }
  }
  for(const row of result.values()) {
    if(!row["Renta Caja Isapre"]&&!row["Renta Caja No Isapre"]) {
      if(String(row["Salud"]).includes("ISAPRE"))row["Renta Caja Isapre"]=Number(row["_Renta_Caja_Base"])||0;
      else row["Renta Caja No Isapre"]=Number(row["_Renta_Caja_Base"])||0;
    }
  }
  return [...result.values()];
}
function parsePrevired(text:string):PreviredRow[] {
  const certificate=/Certificado\s+de\s+Pagos/i.test(text)||/certifica\s*:/i.test(text);
  const rows=certificate?parseCertificate(text):parsePlanilla(text);
  return rows.map(row=>{
    const cleaned:PreviredRow={};
    for(const column of COLUMNS)cleaned[column]=row[column]??(["RUT","Nombre PDF","AFP","Salud"].includes(column)?"":0);
    return cleaned;
  }).filter(row=>String(row.RUT).trim());
}
function downloadExcel(rows:PreviredRow[],filename:string) {
  const sheet=XLSX.utils.json_to_sheet(rows,{header:[...COLUMNS]});
  sheet["!cols"]=[{wch:18},{wch:32},{wch:24},{wch:24},...COLUMNS.slice(4).map(()=>({wch:20}))];
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,sheet,"Previred_Report");
  const bytes=XLSX.write(book,{bookType:"xlsx",type:"array"});
  const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function PreviredExtractor() {
  const [file,setFile]=useState<File|null>(null);
  const [rows,setRows]=useState<PreviredRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  function selectFile(event:ChangeEvent<HTMLInputElement>) {
    const selected=event.target.files?.[0]??null;
    setFile(selected);setRows([]);setError("");setMessage("");
    if(selected&&selected.size>20*1024*1024){setError("El archivo supera 20 MB. Selecciona un PDF más pequeño.");setFile(null);}
  }
  async function process() {
    if(!file){setError("Primero selecciona un PDF de Previred.");return;}
    setBusy(true);setError("");setMessage("");setRows([]);
    try {
      const text=await readPdf(file);
      const extracted=parsePrevired(text);
      if(!extracted.length)throw new Error("No se detectaron trabajadores. Verifica que el PDF sea una planilla o Certificado de Pagos de Previred con texto seleccionable y RUT legibles.");
      setRows(extracted);
      setMessage("Extracción terminada: "+extracted.length.toLocaleString("es-CL")+" trabajador(es). Revisa los valores antes de usar el Excel.");
    } catch(e) {
      setError(e instanceof Error?e.message:"No fue posible procesar el PDF de Previred.");
    } finally {setBusy(false);}
  }
  return <div className="panel">
    <div className="section-head"><h2>Extractor Previred</h2><span className="status">PDF → Excel</span></div>
    <p className="muted">Carga una planilla o Certificado de Pagos de Previred. Se extraen RUT, nombre, AFP, salud y montos previsionales para generar el Excel histórico con la hoja <strong>Previred_Report</strong>.</p>
    <div className="attendance-grid">
      <div className="field"><label htmlFor="previred-pdf">Documento Previred (PDF)</label><input id="previred-pdf" type="file" accept=".pdf,application/pdf" onChange={selectFile}/></div>
      <div className="field"><label>Procesamiento local</label><div className="notice">El PDF se analiza en este navegador; no se carga el documento a Supabase.</div></div>
    </div>
    {file&&<div className="notice">{file.name} · {(file.size/1024).toFixed(1)} KB</div>}
    <div className="actions" style={{marginTop:14}}><button className="btn primary" onClick={()=>void process()} disabled={!file||busy}>{busy?"Extrayendo datos…":"Extraer datos y preparar Excel"}</button>{rows.length>0&&<button className="btn" onClick={()=>downloadExcel(rows,"Reporte_SEYSES_Previred_"+new Date().toISOString().slice(0,10)+".xlsx")}>Descargar Excel Previred</button>}</div>
    {error&&<div className="notice error" role="alert" style={{marginTop:12}}>{error}</div>}
    {message&&<div className="notice success" role="status" style={{marginTop:12}}>{message}</div>}
    {rows.length>0&&<>
      <div className="section-head" style={{marginTop:18}}><h3>Vista previa</h3><span className="status">{rows.length.toLocaleString("es-CL")} trabajadores</span></div>
      <div className="table-wrap"><table><thead><tr>{COLUMNS.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0,100).map((row,index)=><tr key={String(row.RUT)+"-"+index}>{COLUMNS.map(column=><td key={column}>{String(row[column]??"")}</td>)}</tr>)}</tbody></table></div>
      {rows.length>100&&<p className="muted">La vista previa muestra 100 registros; el Excel contiene los {rows.length.toLocaleString("es-CL")} registros detectados.</p>}
      <p className="muted">El Excel conserva las 20 columnas históricas. Contrasta las cifras con el PDF de origen antes de utilizarlas en remuneraciones.</p>
    </>}
  </div>;
}
