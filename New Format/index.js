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
    let lastY = null
    let pageLines = []
    let currentLine = ""
    content.items.forEach(item => {
      const text = item.str
      const y = item.transform[5]
      if (lastY === null) {
        currentLine = text
      } else {
        if (Math.abs(y - lastY) > 2) {
          if (currentLine) pageLines.push(currentLine)
          currentLine = text
        } else {
          currentLine += " " + text
        }
      }
      lastY = y
    })
    if (currentLine) pageLines.push(currentLine)
    fullText += pageLines.join("\n") + "\n"
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

function extractCodigoRowsFromLines(lines) {
  const rows = []
  const regex = /(\d{5})\s+([\d\.\,]+)\s+\$([\d\.\,]+)\s+\$([\d\.\,]+)\s+\$([\d\.\,]+)/
  for (const line of lines) {
    const m = line.match(regex)
    if (!m) continue
    rows.push({
      codigo: m[1],
      valorNominalRaw: m[2],
      cuota1_7Raw: m[3],
      cuota8AdelanteRaw: m[4],
      derechoIngresoRaw: m[5]
    })
  }
  return rows
}

function extractDescripcionRowsFromLines(lines) {
  const rows = []
  let inProducts = false
  const headerPattern = /Derecho de ingreso\s+Cuota comercial del mes/i
  for (let rawLine of lines) {
    let line = rawLine
    if (headerPattern.test(line)) {
      inProducts = true
      continue
    }
    if (!inProducts) continue

    let comboRegex = /(.+?\+)\s+\$([\d\.\,]+)\s+\$([\d\.\,]+)/g
    let comboMatch
    let restLine = ""
    let lastIndex = 0
    let replacedAny = false
    while ((comboMatch = comboRegex.exec(line)) !== null) {
      const desc = comboMatch[1].trim()
      const suscr = comboMatch[3]
      rows.push({
        descripcion: desc,
        suscripcionRaw: suscr
      })
      restLine += line.slice(lastIndex, comboMatch.index)
      lastIndex = comboRegex.lastIndex
      replacedAny = true
    }
    if (replacedAny) {
      restLine += line.slice(lastIndex)
      line = restLine
    }

    let genericRegex = /(.+?)\s+\$([\d\.\,]+)/g
    let m
    while ((m = genericRegex.exec(line)) !== null) {
      let desc = m[1].trim()
      const sus = m[2]
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(desc)) continue
      if (desc.includes("Página")) continue
      if (desc.includes("Descripci") && desc.includes("Suscripci")) continue
      rows.push({
        descripcion: desc,
        suscripcionRaw: sus
      })
    }
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
    const lines = normalized
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0)
    const codigoRows = extractCodigoRowsFromLines(lines)
    const descripcionRows = extractDescripcionRowsFromLines(lines)
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
