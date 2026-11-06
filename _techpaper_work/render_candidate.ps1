$ErrorActionPreference = 'Stop'
$source = (Resolve-Path '_techpaper_work\CARBengine_Technical_Paper_Final_Expanded_candidate.docx').Path
$destination = Join-Path (Get-Location) '_techpaper_work\candidate_expanded.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $document = $word.Documents.Open($source, $false, $true, $false)
    $document.ExportAsFixedFormat($destination, 17)
    $document.Close(0)
}
finally {
    $word.Quit()
}
Get-Item $destination | Select-Object FullName, Length
