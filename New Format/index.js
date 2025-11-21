pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

const form = document.getElementById("uploadForm")
const pdfInput = document.getElementById("pdfInput")
const convertBtn = document.getElementById("convertBtn")
const downloadBtn = document.getElementById("downloadBtn")
const statusText = document.getElementById("statusText")
const output = document.getElementById("output")
const summary = document.getElementById("summary")

let lastJson = null

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ""
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const strings = content.items.map(item => item.str)
    fullText += strings.join(" ") + "\n"
  }
  return fullText
}

function parseNumber(str) {
  if (!str) return null
  let s = String(str)
  s = s.replace(/[^\d\.,]/g, "")
  s = s.replace(/\./g, "")
  s = s.replace(/,/g, ".")
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return n
}

function extractCodigoRows(text) {
  const rows = []
  const regex = /(\d{5})\s+([\d\.\,]+)\s+\$?\s*([\d\.\,]+)\s+\$?\s*([\d\.\,]+)\s+\$?\s*([\d\.\,]+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    rows.push({
      codigo: match[1],
      valorNominalRaw: match[2],
      cuota1_7Raw: match[3],
      cuota8AdelanteRaw: match[4],
      derechoIngresoRaw: match[5]
    })
  }
  return rows
}

function extractDescripcionRows(text) {
  const upper = text
  const sectionMatch = upper.match(/Descripción\s+Suscripción([\s\S]+)/i)
  if (!sectionMatch) return []
  const section = sectionMatch[1]
  const rows = []
  const regex = /([A-ZÁÉÍÓÚÜÑ0-9 ]+?)\s+\$([\d\.\,]+)/g
  let match
  while ((match = regex.exec(section)) !== null) {
    const descripcion = match[1].trim()
    if (!descripcion) continue
    rows.push({
      descripcion: descripcion,
      suscripcionRaw: match[2]
    })
  }
  return rows
}

function buildItems(codigoRows, descripcionRows) {
  const len = Math.max(codigoRows.length, descripcionRows.length)
  const items = []
  for (let i = 0; i < len; i++) {
    const c = codigoRows[i] || {}
    const d = descripcionRows[i] || {}
    items.push({
      codigo: c.codigo || null,
      descripcion: d.descripcion || null,
      valorNominal: parseNumber(c.valorNominalRaw),
      suscripcion: parseNumber(d.suscripcionRaw),
      cuota_1_7: parseNumber(c.cuota1_7Raw),
      cuota_8_adelante: parseNumber(c.cuota8AdelanteRaw),
      derechoIngreso: parseNumber(c.derechoIngresoRaw)
    })
  }
  return items
}

async function handleConvert(event) {
  event.preventDefault()
  if (!pdfInput.files || pdfInput.files.length === 0) {
    statusText.textContent = "Selecciona un archivo PDF."
    return
  }
  const file = pdfInput.files[0]
  convertBtn.disabled = true
  downloadBtn.disabled = true
  statusText.textContent = "Procesando PDF..."
  output.value = ""
  summary.textContent = ""
  lastJson = null

  try {
    const text = await extractTextFromPDF(file)
    const normalized = text.replace(/\r/g, "")
    const codigoRows = extractCodigoRows(normalized)
    const descripcionRows = extractDescripcionRows(normalized)
    const items = buildItems(codigoRows, descripcionRows)
    const result = {
      fileName: file.name,
      itemCount: items.length,
      items
    }
    lastJson = result
    output.value = JSON.stringify(result, null, 2)
    downloadBtn.disabled = false
    summary.textContent = "Archivo: " + file.name + " · Items detectados: " + items.length
    statusText.textContent = "Conversión completada."
  } catch (err) {
    statusText.textContent = "Error al procesar el PDF."
  } finally {
    convertBtn.disabled = false
  }
}

function handleDownload() {
  if (!lastJson) return
  const blob = new Blob([JSON.stringify(lastJson, null, 2)], {
    type: "application/json"
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "resultado.json"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

form.addEventListener("submit", handleConvert)
downloadBtn.addEventListener("click", handleDownload)
