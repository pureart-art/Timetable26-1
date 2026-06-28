# xlsx -> Google Sheets API(spreadsheets.get, includeGridData) 모양의 JSON 스냅샷 추출기
# 사용: powershell -File extract.ps1 -ExtractDir <unzipped xlsx dir> -OutFile <snapshot.js>
param(
  [string]$ExtractDir = "C:\Users\wbnuj\timetable-pwa\_extract",
  [string]$OutFile    = "C:\Users\wbnuj\timetable-pwa\data\snapshot.js",
  [string]$Title      = ""   # 시트 파일 제목(예: v46_26-1시간표_GY) — 버전 배지용. 비면 미포함
)
$ErrorActionPreference = 'Stop'

function Read-Xml($path) { $x = New-Object System.Xml.XmlDocument; $x.Load($path); return $x }

$nsMain = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
$nsDraw = "http://schemas.openxmlformats.org/drawingml/2006/main"

# ---------- theme ----------
$themeDoc = Read-Xml (Join-Path $ExtractDir "xl/theme/theme1.xml")
$nsm = New-Object System.Xml.XmlNamespaceManager($themeDoc.NameTable)
$nsm.AddNamespace("a", $nsDraw)
$clrScheme = $themeDoc.SelectSingleNode("//a:clrScheme", $nsm)
function SchemeHex($node) {
  $srgb = $node.SelectSingleNode("a:srgbClr", $nsm)
  if ($srgb) { return $srgb.GetAttribute("val") }
  $sys = $node.SelectSingleNode("a:sysClr", $nsm)
  if ($sys) { return $sys.GetAttribute("lastClr") }
  return "000000"
}
$schemeOrder = @("dk1","lt1","dk2","lt2","accent1","accent2","accent3","accent4","accent5","accent6","hlink","folHlink")
$schemeMap = @{}
foreach ($name in $schemeOrder) {
  $n = $clrScheme.SelectSingleNode("a:$name", $nsm)
  if ($n) { $schemeMap[$name] = SchemeHex $n }
}
# xlsx color theme attr index -> scheme name (Excel swaps 0/1 and 2/3)
$themeAttrOrder = @("lt1","dk1","lt2","dk2","accent1","accent2","accent3","accent4","accent5","accent6","hlink","folHlink")

# legacy indexed palette (default)
$indexedPalette = @(
"000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF",
"000000","FFFFFF","FF0000","00FF00","0000FF","FFFF00","FF00FF","00FFFF",
"800000","008000","000080","808000","800080","008080","C0C0C0","808080",
"9999FF","993366","FFFFCC","CCFFFF","660066","FF8080","0066CC","CCCCFF",
"000080","FF00FF","FFFF00","00FFFF","800080","800000","008080","0000FF",
"00CCFF","CCFFFF","CCFFCC","FFFF99","99CCFF","FF99CC","CC99FF","FFCC99",
"3366FF","33CCCC","99CC00","FFCC00","FF9900","FF6600","666699","969696",
"003366","339966","003300","333300","993300","993366","333399","333333",
"000000","FFFFFF")

function HexToRgb([string]$hex) {
  $hex = $hex.TrimStart('#')
  if ($hex.Length -eq 8) { $hex = $hex.Substring(2) } # strip ARGB alpha
  return @([Convert]::ToInt32($hex.Substring(0,2),16), [Convert]::ToInt32($hex.Substring(2,2),16), [Convert]::ToInt32($hex.Substring(4,2),16))
}
function ApplyTint([double[]]$rgb01, [double]$tint) {
  # Office tint: applied on HSL lightness
  $r=$rgb01[0]; $g=$rgb01[1]; $b=$rgb01[2]
  $max=[Math]::Max($r,[Math]::Max($g,$b)); $min=[Math]::Min($r,[Math]::Min($g,$b))
  $l=($max+$min)/2.0
  if ($max -eq $min) { $h=0.0; $s=0.0 }
  else {
    $d=$max-$min
    if ($l -gt 0.5) { $s=$d/(2.0-$max-$min) } else { $s=$d/($max+$min) }
    if ($max -eq $r) { $h=(($g-$b)/$d); if ($g -lt $b) { $h += 6 } }
    elseif ($max -eq $g) { $h=(($b-$r)/$d)+2 }
    else { $h=(($r-$g)/$d)+4 }
    $h = $h/6.0
  }
  if ($tint -lt 0) { $l = $l * (1.0 + $tint) } else { $l = $l*(1.0-$tint) + $tint }
  # HSL -> RGB
  if ($s -eq 0) { return @($l,$l,$l) }
  if ($l -lt 0.5) { $q = $l*(1+$s) } else { $q = $l+$s-$l*$s }
  $p = 2*$l - $q
  $out = @()
  foreach ($tc in @(($h+1.0/3), $h, ($h-1.0/3))) {
    $t = $tc
    if ($t -lt 0) { $t += 1 }; if ($t -gt 1) { $t -= 1 }
    if ($t -lt 1.0/6) { $v = $p + ($q-$p)*6*$t }
    elseif ($t -lt 0.5) { $v = $q }
    elseif ($t -lt 2.0/3) { $v = $p + ($q-$p)*(2.0/3-$t)*6 }
    else { $v = $p }
    $out += $v
  }
  return $out
}
function ResolveColor($colorNode) {
  # returns @{red=..;green=..;blue=..} (0..1 floats) or $null
  if ($null -eq $colorNode) { return $null }
  $hex = $null
  if ($colorNode.HasAttribute("rgb")) { $hex = $colorNode.GetAttribute("rgb") }
  elseif ($colorNode.HasAttribute("theme")) {
    $ti = [int]$colorNode.GetAttribute("theme")
    if ($ti -lt $themeAttrOrder.Count) { $hex = $schemeMap[$themeAttrOrder[$ti]] }
  }
  elseif ($colorNode.HasAttribute("indexed")) {
    $ii = [int]$colorNode.GetAttribute("indexed")
    if ($ii -lt $indexedPalette.Count) { $hex = $indexedPalette[$ii] }
  }
  elseif ($colorNode.HasAttribute("auto")) { $hex = "000000" }
  if ($null -eq $hex) { return $null }
  $rgb = HexToRgb $hex
  $rgb01 = @(($rgb[0]/255.0), ($rgb[1]/255.0), ($rgb[2]/255.0))
  if ($colorNode.HasAttribute("tint")) {
    $tint = [double]::Parse($colorNode.GetAttribute("tint"), [Globalization.CultureInfo]::InvariantCulture)
    $rgb01 = ApplyTint $rgb01 $tint
  }
  return @{ red=[Math]::Round($rgb01[0],4); green=[Math]::Round($rgb01[1],4); blue=[Math]::Round($rgb01[2],4) }
}

# ---------- styles ----------
$stylesDoc = Read-Xml (Join-Path $ExtractDir "xl/styles.xml")
$nss = New-Object System.Xml.XmlNamespaceManager($stylesDoc.NameTable)
$nss.AddNamespace("m", $nsMain)

$numFmtMap = @{}
foreach ($nf in $stylesDoc.SelectNodes("//m:numFmts/m:numFmt", $nss)) {
  $numFmtMap[[int]$nf.GetAttribute("numFmtId")] = $nf.GetAttribute("formatCode")
}
$fonts = @()
foreach ($f in $stylesDoc.SelectNodes("//m:fonts/m:font", $nss)) {
  $c = $f.SelectSingleNode("m:color", $nss)
  $fonts += ,@{ color = (ResolveColor $c) }
}
$fills = @()
foreach ($fl in $stylesDoc.SelectNodes("//m:fills/m:fill", $nss)) {
  $pf = $fl.SelectSingleNode("m:patternFill", $nss)
  $bg = $null
  if ($pf -and $pf.GetAttribute("patternType") -eq "solid") {
    $fg = $pf.SelectSingleNode("m:fgColor", $nss)
    $bg = ResolveColor $fg
  }
  $fills += ,@{ bg = $bg }
}
$xfs = @()
foreach ($xf in $stylesDoc.SelectNodes("//m:cellXfs/m:xf", $nss)) {
  $fontId = 0; $fillId = 0; $numFmtId = 0
  if ($xf.HasAttribute("fontId")) { $fontId = [int]$xf.GetAttribute("fontId") }
  if ($xf.HasAttribute("fillId")) { $fillId = [int]$xf.GetAttribute("fillId") }
  if ($xf.HasAttribute("numFmtId")) { $numFmtId = [int]$xf.GetAttribute("numFmtId") }
  $xfs += ,@{ fontId=$fontId; fillId=$fillId; numFmtId=$numFmtId }
}
function IsDateFmt([int]$id) {
  if (($id -ge 14 -and $id -le 22) -or ($id -ge 45 -and $id -le 47)) { return $true }
  if ($numFmtMap.ContainsKey($id)) {
    $code = $numFmtMap[$id] -replace '"[^"]*"', '' -replace '\[[^\]]*\]', ''
    return ($code -match '[ymd]')
  }
  return $false
}

# ---------- shared strings ----------
$ssDoc = Read-Xml (Join-Path $ExtractDir "xl/sharedStrings.xml")
$nsr = New-Object System.Xml.XmlNamespaceManager($ssDoc.NameTable)
$nsr.AddNamespace("m", $nsMain)
$sharedStrings = New-Object System.Collections.ArrayList
foreach ($si in $ssDoc.SelectNodes("/m:sst/m:si", $nsr)) {
  $runs = New-Object System.Collections.ArrayList
  $text = ""
  $directT = $si.SelectSingleNode("m:t", $nsr)
  if ($directT) {
    $text = $directT.InnerText
  } else {
    foreach ($r in $si.SelectNodes("m:r", $nsr)) {
      $t = $r.SelectSingleNode("m:t", $nsr)
      $runText = ""
      if ($t) { $runText = $t.InnerText }
      $colorNode = $r.SelectSingleNode("m:rPr/m:color", $nsr)
      $col = ResolveColor $colorNode
      [void]$runs.Add(@{ start = $text.Length; color = $col })
      $text += $runText
    }
  }
  [void]$sharedStrings.Add(@{ text = $text; runs = $runs })
}

# ---------- sheet1 ----------
$sheetDoc = Read-Xml (Join-Path $ExtractDir "xl/worksheets/sheet1.xml")
$nsh = New-Object System.Xml.XmlNamespaceManager($sheetDoc.NameTable)
$nsh.AddNamespace("m", $nsMain)

function ColIndex([string]$ref) {
  $col = 0
  foreach ($ch in $ref.ToCharArray()) {
    if ($ch -match '[A-Z]') { $col = $col*26 + ([int][char]$ch - 64) } else { break }
  }
  return $col - 1
}

$MAXCOL = 9  # A..I
$rowDataList = New-Object System.Collections.ArrayList
$maxRow = 0
$rowsCells = @{}
foreach ($row in $sheetDoc.SelectNodes("//m:sheetData/m:row", $nsh)) {
  $rIdx = [int]$row.GetAttribute("r")
  if ($rIdx -gt $maxRow) { $maxRow = $rIdx }
  $cells = @{}
  foreach ($c in $row.SelectNodes("m:c", $nsh)) {
    $ref = $c.GetAttribute("r")
    $colIdx = ColIndex $ref
    if ($colIdx -ge $MAXCOL) { continue }
    $sIdx = 0
    if ($c.HasAttribute("s")) { $sIdx = [int]$c.GetAttribute("s") }
    $type = $c.GetAttribute("t")
    $vNode = $c.SelectSingleNode("m:v", $nsh)
    $cellObj = @{}
    $xf = $xfs[$sIdx]
    $fillBg = $fills[$xf.fillId].bg
    $fontCol = $fonts[$xf.fontId].color
    $fmt = @{}
    if ($fillBg) { $fmt.backgroundColor = $fillBg }
    if ($fontCol) { $fmt.textFormat = @{ foregroundColor = $fontCol } }
    if ($fmt.Count -gt 0) { $cellObj.effectiveFormat = $fmt }
    if ($vNode) {
      $raw = $vNode.InnerText
      if ($type -eq "s") {
        $ss = $sharedStrings[[int]$raw]
        $cellObj.formattedValue = $ss.text
        if ($ss.runs.Count -gt 0) {
          $tfr = New-Object System.Collections.ArrayList
          foreach ($run in $ss.runs) {
            $rf = @{}
            if ($run.color) { $rf.foregroundColor = $run.color }
            [void]$tfr.Add(@{ startIndex = $run.start; format = $rf })
          }
          $cellObj.textFormatRuns = $tfr
        }
      } elseif ($type -eq "str") {
        $cellObj.formattedValue = $raw
      } else {
        $num = [double]::Parse($raw, [Globalization.CultureInfo]::InvariantCulture)
        $cellObj.effectiveValue = @{ numberValue = $num }
        if (IsDateFmt $xf.numFmtId) {
          $dt = [DateTime]::FromOADate($num)
          $cellObj.formattedValue = "{0}. {1}. {2}" -f $dt.Year, $dt.Month, $dt.Day
        } else {
          if ($num -eq [Math]::Floor($num)) { $cellObj.formattedValue = [string][long]$num }
          else { $cellObj.formattedValue = [string]$num }
        }
      }
    }
    $cells[$colIdx] = $cellObj
  }
  $rowsCells[$rIdx] = $cells
}

for ($r = 1; $r -le $maxRow; $r++) {
  $vals = New-Object System.Collections.ArrayList
  $cells = $rowsCells[$r]
  for ($cIdx = 0; $cIdx -lt $MAXCOL; $cIdx++) {
    if ($cells -and $cells.ContainsKey($cIdx)) { [void]$vals.Add($cells[$cIdx]) }
    else { [void]$vals.Add(@{}) }
  }
  [void]$rowDataList.Add(@{ values = $vals })
}

# ---------- merges ----------
$merges = New-Object System.Collections.ArrayList
foreach ($mc in $sheetDoc.SelectNodes("//m:mergeCells/m:mergeCell", $nsh)) {
  $ref = $mc.GetAttribute("ref")
  if ($ref -match '^([A-Z]+)(\d+):([A-Z]+)(\d+)$') {
    $c1 = ColIndex $matches[1]; $r1 = [int]$matches[2]
    $c2 = ColIndex $matches[3]; $r2 = [int]$matches[4]
    if ($c1 -ge $MAXCOL) { continue }
    [void]$merges.Add(@{
      startRowIndex = $r1 - 1; endRowIndex = $r2
      startColumnIndex = $c1; endColumnIndex = [Math]::Min($c2 + 1, $MAXCOL)
    })
  }
}

$snapshot = @{
  sheets = @(@{
    properties = @{ title = "시간표"; gridProperties = @{ rowCount = $maxRow; columnCount = $MAXCOL } }
    merges = $merges
    data = @(@{ rowData = $rowDataList })
  })
}
# 최상위 properties.title — 앱이 버전 배지(v46 등)를 여기서 읽음 (라이브 응답과 같은 위치)
if ($Title -ne "") { $snapshot.properties = @{ title = $Title } }

$json = ConvertTo-Json -InputObject $snapshot -Depth 16 -Compress
$outDir = Split-Path $OutFile -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }
$content = "// xlsx에서 추출한 Sheets API 모양 스냅샷 (오프라인/키 미입력 폴백)`nwindow.__SNAPSHOT__ = " + $json + ";`n"
[IO.File]::WriteAllText($OutFile, $content, (New-Object Text.UTF8Encoding($false)))
Write-Host ("OK rows={0} merges={1} bytes={2}" -f $maxRow, $merges.Count, (Get-Item $OutFile).Length)
