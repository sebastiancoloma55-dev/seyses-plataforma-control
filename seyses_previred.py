"""Extractor de reportes PDF de Previred extraído del módulo heredado."""
import io
import re
import pandas as pd
from pypdf import PdfReader

def procesar_pdf_previred(pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    texto_completo = ""
    for page in reader.pages:
        if page.extract_text():
            texto_completo += page.extract_text() + "\n"
    if "Certificado de Pagos" in texto_completo or "certifica:" in texto_completo:
        return extraer_certificado_previred(texto_completo)
    else:
        return extraer_planilla_previred(reader)

def extraer_planilla_previred(reader):
    data = {}
    contexto = "UNKNOWN"
    current_afp = "AFP"
    ruts_empresa = ['77.419.473-8', '24.598.191-0']
    for page in reader.pages:
        text = page.extract_text()
        if not text: continue
        texto_upper = text.upper()
        if "FONDO DE PENSIONES" in texto_upper and "AFP" in texto_upper:
            contexto = "AFP"
            m = re.search(r'AFP\s+([A-Za-z]+)', text, re.IGNORECASE)
            if m: current_afp = "AFP " + m.group(1).strip().capitalize()
        elif "SEGURO SOCIAL PREVISIONAL" in texto_upper:
            contexto = "SEGURO"
        elif "FONASA" in texto_upper or "PLANILLA DE DECLARACION Y PAGO SIMULTANEO" in texto_upper:
            contexto = "FONASA"
        elif "ISAPRE" in texto_upper:
            contexto = "ISAPRE"
            m = re.search(r'ISAPRE\s+([A-Za-z]+)', text, re.IGNORECASE)
            if m: contexto = "ISAPRE " + m.group(1).strip().capitalize()
        elif "MUTUAL DE SEGURIDAD" in texto_upper or "ACHS" in texto_upper or "INSTITUTO DE SEGURIDAD" in texto_upper:
            contexto = "MUTUAL"
        elif "CAJA DE COMPENSACION" in texto_upper or "LOS HEROES" in texto_upper or "LOS ANDES" in texto_upper:
            contexto = "CAJA"

        for line in text.split('\n'):
            m_rut = re.search(r'\b(\d{1,2}\.\d{3}\.\d{3}\-[0-9Kk])\b', line)
            if not m_rut: continue
            rut = m_rut.group(1).upper()
            if rut in ruts_empresa: continue
            if rut not in data:
                data[rut] = {
                    'RUT': rut, 'Nombre PDF': '', 'AFP': '', 'Salud': '', 
                    'Renta Seguro Social': 0, 'Monto Seguro Social': 0, 
                    'Renta AFP': 0, 'Cotizacion AFP': 0, 'SIS AFP': 0, 'APVI': 0, 
                    'Renta AFC': 0, 'AFC Afiliado': 0, 'AFC Empleador': 0, 
                    'Renta Salud': 0, 'Cotizacion Salud': 0, 
                    'Renta Mutual': 0, 'Cotizacion Mutual': 0, 
                    'Renta Caja Isapre': 0, 'Renta Caja No Isapre': 0, 'Cotizacion Caja': 0,
                    '_Renta_Caja_Base': 0
                }
            idx = line.find(rut) + len(rut)
            resto = line[idx:].strip()
            m_name = re.match(r'^([A-ZÑÁÉÍÓÚ\s]+)', resto)
            if m_name:
                name = m_name.group(1).strip()
                name = re.sub(r'\s+AFP$', '', name) 
                name = re.sub(r'\s+JC$', '', name)  
                if len(name) > len(data[rut]['Nombre PDF']):
                    data[rut]['Nombre PDF'] = name
            numeros = re.findall(r'\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b', resto)
            num_puros = [int(n.replace('.', '')) for n in numeros]
            monetary_gt1000 = [n for n in num_puros if n > 1000]
            if not num_puros: continue

            if contexto == "SEGURO":
                if monetary_gt1000: data[rut]['Renta Seguro Social'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Monto Seguro Social'] = monetary_gt1000[1]
            elif contexto == "AFP":
                data[rut]['AFP'] = current_afp
                if len(monetary_gt1000) >= 1: data[rut]['Renta AFP'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Cotizacion AFP'] = monetary_gt1000[1]
                if len(monetary_gt1000) >= 3: data[rut]['SIS AFP'] = monetary_gt1000[2]
                if len(monetary_gt1000) >= 5:
                    data[rut]['Renta AFC'] = monetary_gt1000[3]
                    data[rut]['AFC Empleador'] = monetary_gt1000[4]
                    data[rut]['AFC Afiliado'] = 0
                elif len(monetary_gt1000) >= 4:
                    data[rut]['Renta AFC'] = monetary_gt1000[0]
                    data[rut]['AFC Empleador'] = monetary_gt1000[-1]
            elif contexto == "FONASA":
                data[rut]['Salud'] = 'FONASA'
                if monetary_gt1000: data[rut]['Renta Salud'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Salud'] = monetary_gt1000[1]
            elif "ISAPRE" in contexto:
                data[rut]['Salud'] = contexto
                if monetary_gt1000: data[rut]['Renta Salud'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Salud'] = monetary_gt1000[1]
            elif contexto == "MUTUAL":
                if monetary_gt1000: data[rut]['Renta Mutual'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Mutual'] = monetary_gt1000[1]
            elif contexto == "CAJA":
                if monetary_gt1000: data[rut]['_Renta_Caja_Base'] = monetary_gt1000[0]
                if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Caja'] = monetary_gt1000[1]

    for rut, row in data.items():
        if "ISAPRE" in str(row['Salud']).upper():
            row['Renta Caja Isapre'] = row['_Renta_Caja_Base']
        else:
            row['Renta Caja No Isapre'] = row['_Renta_Caja_Base']
    return list(data.values())

def extraer_certificado_previred(text):
    data = {}
    bloques = re.split(r'Que,\s+las\s+cotizaciones\s+previsionales\s+del\s+Sr\.\(a\)', text, flags=re.IGNORECASE)
    for bloque in bloques[1:]:
        match_info = re.search(r'(.+?),\s+Rut:\s+([\d\.\-kK]+)', bloque)
        if not match_info: continue
        nombre = match_info.group(1).strip()
        rut = match_info.group(2).strip().upper()
        if rut not in data:
             data[rut] = {
                    'RUT': rut, 'Nombre PDF': nombre, 'AFP': '', 'Salud': '', 
                    'Renta Seguro Social': 0, 'Monto Seguro Social': 0, 
                    'Renta AFP': 0, 'Cotizacion AFP': 0, 'SIS AFP': 0, 'APVI': 0, 
                    'Renta AFC': 0, 'AFC Afiliado': 0, 'AFC Empleador': 0, 
                    'Renta Salud': 0, 'Cotizacion Salud': 0, 
                    'Renta Mutual': 0, 'Cotizacion Mutual': 0, 
                    'Renta Caja Isapre': 0, 'Renta Caja No Isapre': 0, 'Cotizacion Caja': 0
                }
        record = data[rut]
        filas = re.findall(r'([A-Z\s\(\)\.\-]+?)\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})\s+(REM|GRA|RET|LEY|COM)\s+\$([\d\.]+)\s+\$([\d\.]+)', bloque)
        for f in filas:
            institucion = f[0].strip().upper()
            imponible = int(f[4].replace('.', ''))
            monto = int(f[5].replace('.', ''))
            if "SEGURO SOCIAL" in institucion:
                record['Renta Seguro Social'] = imponible
                record['Monto Seguro Social'] = monto
            elif "OBLIGATORIA" in institucion:
                record['AFP'] = "AFP " + institucion.replace("(COTIZACION OBLIGATORIA)", "").strip()
                record['Renta AFP'] = imponible
                record['Cotizacion AFP'] = monto
            elif "(SIS)" in institucion:
                record['SIS AFP'] = monto
            elif "APVI" in institucion:
                record['APVI'] = monto
            elif "(AFC)" in institucion:
                record['Renta AFC'] = imponible
                record['AFC Empleador'] = monto
            elif any(x in institucion for x in ["FONASA", "ISAPRE", "MASVIDA", "CRUZ BLANCA", "CONSALUD", "COLMENA", "BANMEDICA"]):
                record['Salud'] = institucion
                record['Renta Salud'] = imponible
                record['Cotizacion Salud'] = monto
            elif any(x in institucion for x in ["MUTUAL", "ACHS", "IST", "ISL"]):
                record['Renta Mutual'] = imponible
                record['Cotizacion Mutual'] = monto
            elif any(x in institucion for x in ["CAJA", "HEROES", "ANDES"]):
                record['Cotizacion Caja'] = monto
                if "ISAPRE" in record['Salud']:
                    record['Renta Caja Isapre'] = imponible
                else:
                    record['Renta Caja No Isapre'] = imponible
    return list(data.values())

def generar_excel_formato_previred(df):
    columnas_plantilla = [
        'RUT', 'Nombre PDF', 'AFP', 'Salud', 'Renta Seguro Social', 'Monto Seguro Social', 
        'Renta AFP', 'Cotizacion AFP', 'SIS AFP', 'APVI', 'Renta AFC', 'AFC Afiliado', 
        'AFC Empleador', 'Renta Salud', 'Cotizacion Salud', 'Renta Mutual', 
        'Cotizacion Mutual', 'Renta Caja Isapre', 'Renta Caja No Isapre', 'Cotizacion Caja'
    ]
    for col in columnas_plantilla:
        if col not in df.columns: df[col] = 0
    df = df[columnas_plantilla]
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Previred_Report')
    return output.getvalue()

# ==========================================
# PANTALLA DE LOGIN
# ==========================================
