"use client";

import { useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

type PositionedItem = { str:string; x:number; y:number; width:number };
type VisualLine = { y:number; items:PositionedItem[] };
type PreviredRow = Record<string,string|number>;
type ProgressState = { page:number; total:number; workers:number; phase:string };
type ContributionEvent = {
  rut:string; name:string; period:string; paymentType:string; institution:string;
  base:number; amount:number; page:number; folio:string;
};
type Aggregate = {
  row:PreviredRow;
  eventKeys:Set<string>;
  sourceTotal:number;
  sourceLines:number;
  classifiedLines:number;
  unclassified:string[];
  pages:Set<number>;
};
type AuditRow = {
  "RUT":string; "Nombre":string; "Período":string; "Tipo pago":string;
  "Páginas fuente":string; "Líneas encontradas":number; "Líneas clasificadas":number;
  "Líneas sin clasificar":string; "Total cotizado en PDF":number; "Total asignado en Excel":number;
  "Diferencia":number; "Estado":string;
};

const HISTORIC_COLUMNS = [
  "RUT", "Nombre PDF", "AFP", "Salud", "Renta Seguro Social", "Monto Seguro Social",
  "Renta AFP", "Cotizacion AFP", "SIS AFP", "APVI", "Renta AFC", "AFC Afiliado",
  "AFC Empleador", "Renta Salud", "Cotizacion Salud", "Renta Mutual",
  "Cotizacion Mutual", "Renta Caja Isapre", "Renta Caja No Isapre", "Cotizacion Caja"
] as const;
// Preserve the original 20 columns, and add explicit fields so the source period and
// AFC amount are not misrepresented as an employer/affiliate split the certificate does not provide.
const EXTRA_COLUMNS = ["Período cotización", "Tipo Pago", "Monto AFC certificado (sin desglose)"] as const;
const COLUMNS = [...HISTORIC_COLUMNS, ...EXTRA_COLUMNS] as const;
const AMOUNT_COLUMNS = [
  "Monto Seguro Social", "Cotizacion AFP", "SIS AFP", "APVI", "AFC Afiliado",
  "AFC Empleador", "Cotizacion Salud", "Cotizacion Mutual", "Cotizacion Caja",
  "Monto AFC certificado (sin desglose)"
] as const;
type MutablePreviredRow = Record<string,string|number>;
const MONTHS = "Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|January|February|March|April|May|June|July|August|September|October|November|December";
const MAX_PDF_PAGES = 10000;
const MAX_PDF_BYTES = 250 * 1024 * 1024;

function normalize(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
}
function formatRut(value:string) {
  const raw=value.replace(/\s/g,"").toUpperCase();
  const match=raw.match(/^(\d{1,2}\.?\d{3}\.?\d{3})-?([\dK])$/) || raw.match(/^(\d{7,8})-?([\dK])$/);
  if (!match) return raw;
  const digits=match[1].replace(/\./g,"");
  return digits.slice(0,-6)+"."+digits.slice(-6,-3)+"."+digits.slice(-3)+"-"+match[2];
}
function parseMoney(value:string) {
  const raw=value.replace(/\$/g,"").replace(/\s/g,"").trim();
  if (!raw) return 0;
  const n=Number(raw.replace(/\./g,"").replace(/,/g,"."));
  return Number.isFinite(n)?Math.round(n):0;
}
function newRow(rut:string,name:string,period:string,paymentType:string):MutablePreviredRow {
  const row:MutablePreviredRow = {
    "RUT":formatRut(rut),"Nombre PDF":name,"AFP":"","Salud":"",
    "Renta Seguro Social":0,"Monto Seguro Social":0,"Renta AFP":0,"Cotizacion AFP":0,
    "SIS AFP":0,"APVI":0,"Renta AFC":0,"AFC Afiliado":0,"AFC Empleador":0,
    "Renta Salud":0,"Cotizacion Salud":0,"Renta Mutual":0,"Cotizacion Mutual":0,
    "Renta Caja Isapre":0,"Renta Caja No Isapre":0,"Cotizacion Caja":0,
    "_Renta_Caja_Base":0,"Período cotización":period,"Tipo Pago":paymentType,
    "Monto AFC certificado (sin desglose)":0
  };
  return row;
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
function extractRutAndName(text:string):{rut:string;name:string}|null {
  const match=text.match(/Que,\s*las\s*cotizaciones\s*previsionales\s*del\s*Sr\.?\s*\(a\)\s*([\s\S]*?),\s*Rut\s*:\s*([\d.\-kK]+)/i);
  if(!match)return null;
  return {name:match[1].replace(/\s+/g," ").replace(/^[\s:,.]+|[\s:,.]+$/g,"").trim(),rut:formatRut(match[2])};
}
function monthLabel(month:string,year:string) {
  const months:Record<string,string> = {
    ENE:"Enero",ENERO:"Enero",JAN:"Enero",JANUARY:"Enero",
    FEB:"Febrero",FEBRERO:"Febrero",FEBRUARY:"Febrero",
    MAR:"Marzo",MARZO:"Marzo",MARCH:"Marzo",
    ABR:"Abril",ABRIL:"Abril",APR:"Abril",APRIL:"Abril",
    MAY:"Mayo",MAYO:"Mayo",JUN:"Junio",JUNIO:"Junio",JUNE:"Junio",
    JUL:"Julio",JULIO:"Julio",JULY:"Julio",
    AGO:"Agosto",AGOSTO:"Agosto",AUG:"Agosto",AUGUST:"Agosto",
    SEP:"Septiembre",SEPT:"Septiembre",SEPTIEMBRE:"Septiembre",SEPTEMBER:"Septiembre",
    OCT:"Octubre",OCTUBRE:"Octubre",OCTOBER:"Octubre",
    NOV:"Noviembre",NOVIEMBRE:"Noviembre",NOVEMBER:"Noviembre",
    DIC:"Diciembre",DICIEMBRE:"Diciembre",DEC:"Diciembre",DECEMBER:"Diciembre"
  };
  return (months[normalize(month).replace(/\./g,"")]||month)+" "+year;
}
function classifyInstitution(institution:string):
  {label:string;baseColumn?:string;amountColumn?:string;afp?:string;health?:string}|null {
  const inst=normalize(institution);
  // Caja must be tested before ISAPRE: "COT. DE NO AFILIADO A ISAPRE" is a Caja concept.
  if(inst.includes("COT. DE NO AFILIADO A ISAPRE")||inst.includes("COTIZACION DE NO AFILIADO A ISAPRE")||
     inst.includes("CAJA DE COMPENSACION")||inst.includes("CAJA LOS HEROES")||inst.includes("CAJA LOS ANDES")||
     inst.startsWith("LOS HEROES")||inst.startsWith("LOS ANDES")||inst.includes("CAJA DE COMPENSACIÓN")) {
    return {label:"CAJA",baseColumn:"_Renta_Caja_Base",amountColumn:"Cotizacion Caja"};
  }
  if(inst.includes("SEGURO SOCIAL")) return {label:"SEGURO SOCIAL",baseColumn:"Renta Seguro Social",amountColumn:"Monto Seguro Social"};
  if(inst.includes("OBLIGATORIA")) {
    const fund=inst.replace(/\s*\(COTIZACION OBLIGATORIA\)\s*/,"").trim();
    return {label:"AFP OBLIGATORIA",baseColumn:"Renta AFP",amountColumn:"Cotizacion AFP",afp:(fund.startsWith("AFP")?fund:"AFP "+fund)};
  }
  if(inst.includes("(SIS)")||inst.endsWith(" SIS")) {
    const fund=inst.replace(/\s*\(SIS\)\s*/,"").replace(/\s+SIS$/,"").trim();
    return {label:"SIS",amountColumn:"SIS AFP",afp:(fund.startsWith("AFP")?fund:"AFP "+fund)};
  }
  if(inst.includes("APVI")) {
    const fund=inst.replace(/\s*\(APVI\)\s*/,"").trim();
    return {label:"APVI",amountColumn:"APVI",afp:(fund.startsWith("AFP")?fund:"AFP "+fund)};
  }
  if(inst.includes("(AFC)")||inst.endsWith(" AFC")||inst.includes("CESANTIA")) {
    const fund=inst.replace(/\s*\(AFC\)\s*/,"").replace(/\s+AFC$/,"").trim();
    return {label:"AFC",baseColumn:"Renta AFC",amountColumn:"Monto AFC certificado (sin desglose)",afp:(fund.startsWith("AFP")?fund:"AFP "+fund)};
  }
  if(["FONASA","ISAPRE","MASVIDA","CRUZ BLANCA","CONSALUD","COLMENA","BANMEDICA","NUEVA MASVIDA","VIDA TRES"].some(value=>inst.includes(value))) {
    return {label:"SALUD",baseColumn:"Renta Salud",amountColumn:"Cotizacion Salud",health:institution.replace(/\s+/g," ").trim()};
  }
  if(["MUTUAL","ACHS","IST","ISL","INSTITUTO DE SEGURIDAD","SEGURIDAD CCHC"].some(value=>inst.includes(value))) {
    return {label:"MUTUAL",baseColumn:"Renta Mutual",amountColumn:"Cotizacion Mutual"};
  }
  return null;
}
function parseContributionLine(line:string):{institution:string;period:string;paymentType:string;base:number;amount:number;folio:string}|null {
  const compact=line.replace(/\s+/g," ").trim();
  const pattern=new RegExp("^(.+?)\\s+("+MONTHS+")\\s+(\\d{4})\\s+(REM|GRA|RET|LEY|COM)\\s+\\$?\\s*([\\d][\\d.,]*)\\s+\\$?\\s*([\\d][\\d.,]*)(?:\\s+(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+))?\\s*$","i");
  const match=compact.match(pattern);
  if(!match)return null;
  return {
    institution:match[1].trim(),
    period:monthLabel(match[2],match[3]),
    paymentType:match[4].toUpperCase(),
    base:parseMoney(match[5]),
    amount:parseMoney(match[6]),
    folio:match[8]||""
  };
}
function contributionLines(pageText:string):Array<{line:string;data:NonNullable<ReturnType<typeof parseContributionLine>>}> {
  const lines=pageText.split(/\r?\n/).map(line=>line.replace(/\s+/g," ").trim()).filter(Boolean);
  const result:Array<{line:string;data:NonNullable<ReturnType<typeof parseContributionLine>>}>=[];
  const signatures=new Set<string>();
  for(let i=0;i<lines.length;i++) {
    const direct=parseContributionLine(lines[i]);
    if(direct) {
      const signature=[direct.institution,direct.period,direct.paymentType,direct.base,direct.amount,direct.folio].join("|");
      if(!signatures.has(signature)){signatures.add(signature);result.push({line:lines[i],data:direct});}
      continue;
    }
    // Handle extractors that split a table row across adjacent text baselines.
    for(let span=2;span<=3 && i+span-1<lines.length;span++) {
      const candidate=lines.slice(i,i+span).join(" ");
      const joined=parseContributionLine(candidate);
      if(!joined)continue;
      const signature=[joined.institution,joined.period,joined.paymentType,joined.base,joined.amount,joined.folio].join("|");
      if(!signatures.has(signature)){signatures.add(signature);result.push({line:candidate,data:joined});}
      i+=span-1;
      break;
    }
  }
  return result;
}
function createAggregate(rut:string,name:string,period:string,paymentType:string):Aggregate {
  return {
    row:newRow(rut,name,period,paymentType),eventKeys:new Set<string>(),sourceTotal:0,
    sourceLines:0,classifiedLines:0,unclassified:[],pages:new Set<number>()
  };
}
function addCertificatePage(
  pageText:string,pageNumber:number,aggregates:Map<string,Aggregate>,fallbackIdentity:{rut:string;name:string}|null
):{identity:{rut:string;name:string}|null;matchedLines:number;hasHeader:boolean;recognizedContributionPage:boolean;unclassified:string[];duplicatesSkipped:number} {
  const header=extractRutAndName(pageText);
  const hasHeader=/Que,\s*las\s*cotizaciones\s*previsionales/i.test(pageText);
  const identity=header || (!hasHeader ? fallbackIdentity : null);
  const contributions=contributionLines(pageText);
  const unknown:string[]=[];
  if(!identity||!contributions.length) {
    return {identity:header||fallbackIdentity,matchedLines:contributions.length,hasHeader,recognizedContributionPage:false,unclassified:unknown,duplicatesSkipped:0};
  }
  let duplicatesSkipped=0;
  for(const entry of contributions) {
    const item=entry.data;
    const key=[identity.rut,item.period,item.paymentType].join("|");
    const aggregate=aggregates.get(key)||createAggregate(identity.rut,identity.name,item.period,item.paymentType);
    aggregate.pages.add(pageNumber);
    if(!aggregate.row["Nombre PDF"] && identity.name)aggregate.row["Nombre PDF"]=identity.name;
    const classified=classifyInstitution(item.institution);
    const eventKey=[identity.rut,item.period,item.paymentType,normalize(item.institution),item.base,item.amount,item.folio].join("|");
    if(aggregate.eventKeys.has(eventKey)){duplicatesSkipped++;continue;}
    aggregate.eventKeys.add(eventKey);
    aggregate.sourceTotal+=item.amount;
    aggregate.sourceLines++;
    if(!classified) {
      const label=item.institution+" · "+item.period+" · "+item.paymentType+" · $"+item.amount.toLocaleString("es-CL");
      aggregate.unclassified.push(label);unknown.push(label);
      aggregates.set(key,aggregate);
      continue;
    }
    aggregate.classifiedLines++;
    const row=aggregate.row;
    if(classified.baseColumn) row[classified.baseColumn]=(Number(row[classified.baseColumn])||0)+item.base;
    if(classified.amountColumn) row[classified.amountColumn]=(Number(row[classified.amountColumn])||0)+item.amount;
    if(classified.afp) row["AFP"]=classified.afp;
    if(classified.health) row["Salud"]=classified.health;
    aggregates.set(key,aggregate);
  }
  return {identity:header||fallbackIdentity,matchedLines:contributions.length,hasHeader,recognizedContributionPage:true,unclassified:unknown,duplicatesSkipped};
}
function mergePlanillaRows(
  parsed:MutablePreviredRow[],pageNumber:number,period:string,aggregates:Map<string,Aggregate>
) {
  for(const parsedRow of parsed) {
    const rut=formatRut(String(parsedRow["RUT"]||""));
    if(!rut)continue;
    const rowPeriod=String(parsedRow["Período cotización"]||period||"Período no identificado");
    const paymentType=String(parsedRow["Tipo Pago"]||"Tipo no identificado");
    const key=[rut,rowPeriod,paymentType].join("|");
    const aggregate=aggregates.get(key)||createAggregate(rut,String(parsedRow["Nombre PDF"]||""),rowPeriod,paymentType);
    aggregate.pages.add(pageNumber);
    for(const column of HISTORIC_COLUMNS) {
      const incoming=parsedRow[column];
      if(incoming===undefined||incoming===null||incoming==="")continue;
      if(typeof incoming==="number" || (typeof incoming==="string"&&incoming.trim()!==""&&Number.isFinite(Number(incoming)))) {
        const value=Number(incoming)||0;
        if(!value)continue;
        const existing=Number(aggregate.row[column])||0;
        if(!existing)aggregate.row[column]=value;
        else if(existing!==value)aggregate.unclassified.push("Conflicto de planilla: "+column+" difiere entre páginas "+[...aggregate.pages].join(", "));
      } else if(!aggregate.row[column]) aggregate.row[column]=String(incoming);
    }
    aggregates.set(key,aggregate);
  }
}
function mappedAmountTotal(row:PreviredRow) {
  return AMOUNT_COLUMNS.reduce((total,column)=>total+(Number(row[column])||0),0);
}
function safeOutputRow(row:PreviredRow):PreviredRow {
  const output:PreviredRow={};
  for(const column of COLUMNS) {
    if(column==="RUT"||column==="Nombre PDF"||column==="AFP"||column==="Salud"||EXTRA_COLUMNS.includes(column as typeof EXTRA_COLUMNS[number])) output[column]=row[column]??"";
    else output[column]=Number(row[column])||0;
  }
  return output;
}
function downloadExcel(rows:PreviredRow[],audit:AuditRow[],filename:string) {
  const book=XLSX.utils.book_new();
  const sheet=XLSX.utils.json_to_sheet(rows,{header:[...COLUMNS]});
  sheet["!cols"]=[{wch:18},{wch:32},{wch:22},{wch:28},...COLUMNS.slice(4).map(()=>({wch:22}))];
  XLSX.utils.book_append_sheet(book,sheet,"Previred_Report");
  const auditSheet=XLSX.utils.json_to_sheet(audit,{
    header:["RUT","Nombre","Período","Tipo pago","Páginas fuente","Líneas encontradas","Líneas clasificadas","Líneas sin clasificar","Total cotizado en PDF","Total asignado en Excel","Diferencia","Estado"]
  });
  auditSheet["!cols"]=[{wch:18},{wch:32},{wch:20},{wch:14},{wch:24},{wch:18},{wch:18},{wch:70},{wch:22},{wch:22},{wch:15},{wch:26}];
  XLSX.utils.book_append_sheet(book,auditSheet,"Control_Validacion");
  const bytes=XLSX.write(book,{bookType:"xlsx",type:"array"});
  const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=filename;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function PreviredExtractor() {
  const [file,setFile]=useState<File|null>(null);
  const [rows,setRows]=useState<PreviredRow[]>([]);
  const [audit,setAudit]=useState<AuditRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [progress,setProgress]=useState<ProgressState|null>(null);
  const [manualPlanillaReview,setManualPlanillaReview]=useState(false);
  const cancelRef=useRef(false);
  const [fileMode,setFileMode]=useState<"certificate"|"planilla"|null>(null);
  const [unrecognizedPages,setUnrecognizedPages]=useState<number[]>([]);
  const [unclassifiedLines,setUnclassifiedLines]=useState<string[]>([]);
  const [duplicates,setDuplicates]=useState(0);

  function selectFile(event:ChangeEvent<HTMLInputElement>) {
    const selected=event.target.files?.[0]??null;
    setFile(selected);setRows([]);setAudit([]);setError("");setMessage("");setProgress(null);
    setManualPlanillaReview(false);setFileMode(null);setUnrecognizedPages([]);setUnclassifiedLines([]);setDuplicates(0);
    if(selected&&selected.size>MAX_PDF_BYTES) {
      setError("El archivo supera 250 MB. Para procesar hasta 10.000 páginas, divide los PDF escaneados o archivos mayores a 250 MB en varios PDF digitales.");
      setFile(null);
    }
  }
  async function process() {
    if(!file){setError("Primero selecciona un PDF de Previred.");return;}
    cancelRef.current=false;
    setBusy(true);setError("");setMessage("");setRows([]);setAudit([]);
    setProgress({page:0,total:0,workers:0,phase:"Abriendo PDF"});
    try {
      const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
      const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),stopAtErrors:true}).promise;
      if(pdf.numPages>MAX_PDF_PAGES) {
        await pdf.destroy();
        throw new Error("El PDF tiene "+pdf.numPages.toLocaleString("es-CL")+" páginas. El máximo por archivo es 10.000; divide el documento y procesa las partes por separado.");
      }
      const aggregates=new Map<string,Aggregate>();
      const unrecognized:number[]=[];
      const allUnclassified:string[]=[];
      let textPages=0;
      let pagesWithRows=0;
      let duplicatesSkipped=0;
      let mode:"certificate"|"planilla"|null=null;
      let fallbackIdentity:{rut:string;name:string}|null=null;
      let planillaManualNeeded=false;
      const updateEvery=Math.max(1,Math.ceil(pdf.numPages/100));
      try {
        for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++) {
          if(cancelRef.current)throw new Error("Extracción cancelada. No se generó Excel.");
          const page=await pdf.getPage(pageNumber);
          const content=await page.getTextContent();
          const source=content.items as unknown as Array<{str?:unknown;transform?:unknown;width?:unknown}>;
          const items:PositionedItem[]=source
            .filter(item=>typeof item.str==="string"&&(item.str as string).trim()&&Array.isArray(item.transform))
            .map(item=>{
              const transform=item.transform as number[];
              return {str:(item.str as string).trim(),x:Number(transform[4])||0,y:Number(transform[5])||0,width:Number(item.width)||0};
            });
          const pageText=linesFromItems(items).map(line=>line.items.map(item=>item.str).join(" ")).join("\n");
          page.cleanup();
          if(pageText.trim())textPages++;
          if(!mode&&pageText.trim()) {
            mode=/Certificado\s+de\s+Pagos|cotizaciones\s*previsionales\s*del\s*Sr/i.test(pageText)?"certificate":"planilla";
            setFileMode(mode);
          }
          if(mode==="certificate") {
            const result=addCertificatePage(pageText,pageNumber,aggregates,fallbackIdentity);
            if(result.identity)fallbackIdentity=result.identity;
            if(result.matchedLines>0&&result.recognizedContributionPage) {
              pagesWithRows++;
              allUnclassified.push(...result.unclassified);
              duplicatesSkipped+=result.duplicatesSkipped;
            } else if(pageText.trim()) {
              unrecognized.push(pageNumber);
            }
          } else if(mode==="planilla") {
            const parsed=parsePlanilla(pageText) as MutablePreviredRow[];
            const periodMatch=pageText.match(new RegExp("("+MONTHS+")\\s+(\\d{4})","i"));
            const paymentMatch=pageText.match(/\b(REM|GRA|RET|LEY|COM)\b/i);
            const period=periodMatch?monthLabel(periodMatch[1],periodMatch[2]):"Período no identificado";
            for(const row of parsed) {
              row["Período cotización"]=period;
              row["Tipo Pago"]=paymentMatch?paymentMatch[1].toUpperCase():"Tipo no identificado";
            }
            if(parsed.length) {
              pagesWithRows++;
              mergePlanillaRows(parsed,pageNumber,period,aggregates);
              planillaManualNeeded=true;
            } else if(pageText.trim()) unrecognized.push(pageNumber);
          }
          if(pageNumber===1||pageNumber===pdf.numPages||pageNumber%updateEvery===0) {
            setProgress({page:pageNumber,total:pdf.numPages,workers:new Set(Array.from(aggregates.values()).map(item=>String(item.row.RUT))).size,phase:"Leyendo y conciliando páginas"});
          }
          if(pageNumber%5===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        const totalPages=pdf.numPages;
        await pdf.destroy();
        if(!textPages)throw new Error("El PDF no contiene texto seleccionable. Los PDF escaneados requieren OCR; descarga el PDF digital desde Previred.");
        if(!aggregates.size)throw new Error("No se detectaron trabajadores y cotizaciones. Verifica que sea un PDF de Previred con texto seleccionable.");
        const records=Array.from(aggregates.values());
        for(const aggregate of records) {
          const row=aggregate.row;
          const cajaBase=Number(row["_Renta_Caja_Base"])||0;
          if(cajaBase>0) {
            if(String(row["Salud"]||"").toUpperCase().includes("ISAPRE")) {
              row["Renta Caja Isapre"]=cajaBase;row["Renta Caja No Isapre"]=0;
            } else {
              row["Renta Caja No Isapre"]=cajaBase;row["Renta Caja Isapre"]=0;
            }
          }
        }
        const outputRows=records.map(item=>safeOutputRow(item.row)).sort((a,b)=>{
          const rut=String(a.RUT).localeCompare(String(b.RUT),"es");
          return rut||String(a["Período cotización"]).localeCompare(String(b["Período cotización"]),"es")||String(a["Tipo Pago"]).localeCompare(String(b["Tipo Pago"]),"es");
        });
        const auditRows:AuditRow[]=records.map(item=>{
          const excelTotal=mappedAmountTotal(item.row);
          const diff=excelTotal-item.sourceTotal;
          const unknown=item.unclassified.join(" | ");
          const status=unknown?"NO CONCILIADO: institución sin clasificar":Math.abs(diff)>0?"NO CONCILIADO: diferencia de montos":"OK";
          return {
            "RUT":String(item.row.RUT||""),"Nombre":String(item.row["Nombre PDF"]||""),
            "Período":String(item.row["Período cotización"]||""),"Tipo pago":String(item.row["Tipo Pago"]||""),
            "Páginas fuente":Array.from(item.pages).sort((a,b)=>a-b).join(", "),
            "Líneas encontradas":item.sourceLines,"Líneas clasificadas":item.classifiedLines,
            "Líneas sin clasificar":unknown,"Total cotizado en PDF":item.sourceTotal,
            "Total asignado en Excel":excelTotal,"Diferencia":diff,"Estado":status
          };
        });
        const unknownRows=auditRows.filter(item=>item["Estado"]!=="OK");
        const hasCriticalPageIssues=unrecognized.length>0;
        const canAutoReconcile=mode==="certificate"&&!unknownRows.length&&!hasCriticalPageIssues&&pagesWithRows===totalPages;
        setRows(outputRows);
        setAudit(auditRows);
        setUnrecognizedPages(unrecognized);
        setUnclassifiedLines(allUnclassified);
        setDuplicates(duplicatesSkipped);
        setFileMode(mode);
        setProgress({page:totalPages,total:totalPages,workers:new Set(records.map(item=>String(item.row.RUT))).size,phase:"Conciliación terminada"});
        if(canAutoReconcile) {
          setMessage("Conciliación automática correcta: "+new Set(records.map(item=>String(item.row.RUT))).size.toLocaleString("es-CL")+" trabajadores · "+records.length.toLocaleString("es-CL")+" filas por período/tipo · "+pagesWithRows.toLocaleString("es-CL")+"/"+totalPages.toLocaleString("es-CL")+" páginas procesadas · diferencias $0. "+(duplicatesSkipped?duplicatesSkipped+" duplicados exactos omitidos. ":"")+"Se añadió la hoja Control_Validacion.");
        } else if(mode==="planilla"&&planillaManualNeeded) {
          setMessage("Se leyeron "+records.length.toLocaleString("es-CL")+" registros de planilla y "+pagesWithRows.toLocaleString("es-CL")+"/"+totalPages.toLocaleString("es-CL")+" páginas con datos. Este formato requiere revisión manual antes de habilitar la descarga, porque la estructura de planillas varía entre instituciones.");
        } else {
          setMessage("Se encontraron "+records.length.toLocaleString("es-CL")+" registros, pero no se pudo confirmar que todas las cotizaciones coincidan. Revisa el control de validación; la descarga automática quedó bloqueada.");
        }
      } finally {
        try { await pdf.destroy(); } catch {}
      }
    } catch(e) {
      setError(e instanceof Error?e.message:"No fue posible procesar el PDF de Previred.");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const auditFailed=audit.some(row=>row["Estado"]!=="OK")||unrecognizedPages.length>0||unclassifiedLines.length>0;
  const automaticallyReconciled=fileMode==="certificate"&&rows.length>0&&audit.length>0&&!auditFailed;
  const canDownload=automaticallyReconciled||(fileMode==="planilla"&&manualPlanillaReview&&rows.length>0&&!unrecognizedPages.length);
  const percent=progress&&progress.total?Math.min(100,Math.round(progress.page/progress.total*100)):0;
  function confirmPlanillaReview() {
    setManualPlanillaReview(true);
    setMessage("Revisión manual confirmada por el usuario. La hoja Control_Validacion indicará que la conciliación automática de esta planilla no fue posible.");
  }

  return <div className="panel">
    <div className="section-head"><h2>Extractor Previred</h2><span className="status">PDF → Excel · Hasta 10.000 páginas</span></div>
    <p className="muted">Procesa certificados de pago página por página. El Excel mantiene las 20 columnas históricas y añade Período, Tipo de Pago y el monto AFC del certificado sin inventar un desglose que el PDF no contiene. Incluye una segunda hoja que compara los importes del PDF con los importes asignados en Excel.</p>
    <div className="attendance-grid">
      <div className="field"><label htmlFor="previred-pdf">Documento Previred (PDF)</label><input id="previred-pdf" type="file" accept=".pdf,application/pdf" onChange={selectFile} disabled={busy}/></div>
      <div className="field"><label>Procesamiento local</label><div className="notice">El archivo se analiza en este navegador; no se carga el documento a Supabase. Límite: 10.000 páginas y 250 MB por archivo.</div></div>
    </div>
    {file&&<div className="notice">{file.name} · {(file.size/1024/1024).toFixed(2)} MB</div>}
    {progress&&<div className="notice" style={{marginTop:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{progress.phase}</strong><span>{progress.page.toLocaleString("es-CL")} / {progress.total.toLocaleString("es-CL")} páginas · {progress.workers.toLocaleString("es-CL")} trabajadores</span></div>
      <progress value={progress.page} max={Math.max(1,progress.total)} style={{width:"100%",height:12,marginTop:8}}/>
      <div className="muted" style={{marginTop:5}}>{percent}% completado</div>
    </div>}
    <div className="actions" style={{marginTop:14}}>
      {!busy&&<button className="btn primary" onClick={()=>void process()} disabled={!file}>Procesar y conciliar todas las páginas</button>}
      {busy&&<button type="button" className="btn" onClick={()=>{cancelRef.current=true;setMessage("Cancelando lectura de forma segura…");}}>Cancelar extracción</button>}
      {canDownload&&<button className="btn primary" onClick={()=>downloadExcel(rows,audit,"Reporte_SEYSES_Previred_"+new Date().toISOString().slice(0,10)+".xlsx")}>Descargar Excel conciliado</button>}
    </div>
    {error&&<div className="notice error" role="alert" style={{marginTop:12}}>{error}</div>}
    {message&&<div className="notice" role="status" style={{marginTop:12}}>{message}</div>}
    {fileMode==="planilla"&&rows.length>0&&!manualPlanillaReview&&<div className="notice error" style={{marginTop:12}}>
      <strong>La estructura se detectó como planilla, no como Certificado de Pagos.</strong> Los datos se leyeron, pero aún no es posible certificar coincidencia automática de todos los campos de esta plantilla. Revisa el PDF y el Excel antes de permitir la descarga.
      <div className="actions" style={{marginTop:10}}><button type="button" className="btn" onClick={confirmPlanillaReview}>He revisado la planilla manualmente</button></div>
    </div>}
    {unrecognizedPages.length>0&&<div className="notice error" role="alert" style={{marginTop:12}}>
      No se pudieron conciliar {unrecognizedPages.length.toLocaleString("es-CL")} páginas. La descarga queda bloqueada. Primeras páginas con error: {unrecognizedPages.slice(0,30).join(", ")}{unrecognizedPages.length>30?"…":""}
    </div>}
    {unclassifiedLines.length>0&&<div className="notice error" role="alert" style={{marginTop:12}}>
      Hay instituciones o conceptos no clasificados. No se habilitó la descarga porque algunas cotizaciones podrían faltar. Primeras líneas: {unclassifiedLines.slice(0,8).join(" | ")}
    </div>}
    {audit.length>0&&<div style={{marginTop:18}}>
      <div className="section-head"><h3>Control de coincidencia</h3><span className="status">{audit.filter(row=>row["Estado"]==="OK").length.toLocaleString("es-CL")} / {audit.length.toLocaleString("es-CL")} filas OK</span></div>
      <div className="table-wrap"><table><thead><tr>{["RUT","Nombre","Período","Tipo pago","Total cotizado en PDF","Total asignado en Excel","Diferencia","Estado"].map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>
        {audit.slice(0,100).map((row,index)=><tr key={row.RUT+"-"+row.Período+"-"+row["Tipo pago"]+"-"+index}>
          <td>{row.RUT}</td><td>{row.Nombre}</td><td>{row.Período}</td><td>{row["Tipo pago"]}</td>
          <td>{Number(row["Total cotizado en PDF"]).toLocaleString("es-CL")}</td><td>{Number(row["Total asignado en Excel"]).toLocaleString("es-CL")}</td><td>{Number(row.Diferencia).toLocaleString("es-CL")}</td><td>{row.Estado}</td>
        </tr>)}
      </tbody></table></div>
      {audit.length>100&&<p className="muted">Mostrando 100 filas del control; la hoja Control_Validacion del Excel incluye las {audit.length.toLocaleString("es-CL")} filas.</p>}
    </div>}
    {rows.length>0&&<>
      <div className="section-head" style={{marginTop:18}}><h3>Vista previa</h3><span className="status">{new Set(rows.map(row=>String(row.RUT))).size.toLocaleString("es-CL")} trabajadores · {rows.length.toLocaleString("es-CL")} filas</span></div>
      <div className="table-wrap"><table><thead><tr>{COLUMNS.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0,100).map((row,index)=><tr key={String(row.RUT)+"-"+String(row["Período cotización"])+"-"+index}>{COLUMNS.map(column=><td key={column}>{String(row[column]??"")}</td>)}</tr>)}</tbody></table></div>
      {rows.length>100&&<p className="muted">La vista previa muestra 100 registros; el Excel incluye los {rows.length.toLocaleString("es-CL")} registros detectados.</p>}
      <p className="muted">En Certificado de Pagos, AFC se exporta como monto certificado sin desglose. No se atribuye al afiliado ni al empleador sin respaldo del documento.</p>
    </>}
  </div>;
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
      const row=result.get(rut)||newRow(rut,"","Período no identificado","Tipo no identificado");
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
