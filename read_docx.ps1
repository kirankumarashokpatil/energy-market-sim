$docPath = "c:\Users\kiran\OneDrive\Documents\Natpower UK\Balancing Mechanism Simulation\gridforge-app\GridForge_Bug_Report (1).docx"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($docPath)
$entry = $zip.GetEntry("word/document.xml")
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()
$text = [regex]::Replace($content, "<[^>]*>", " ")
$text = [regex]::Replace($text, "\s+", " ")
Write-Output $text.Trim()
