' pgStudio - Background Launcher untuk Windows
' Menjalankan pgstudio.exe secara tersembunyi (tanpa jendela command prompt)
' dan membuka browser default.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strExe = strScriptDir & "\pgstudio.exe"

If Not fso.FileExists(strExe) Then
    MsgBox "File pgstudio.exe tidak ditemukan di: " & vbCrLf & strExe, vbCritical, "pgStudio Error"
    WScript.Quit 1
End If

' Jalankan server di background (mode window 0 = hidden, false = jangan tunggu)
WshShell.Run """" & strExe & """", 0, False

' Tunggu 1.5 detik agar port siap, lalu buka browser
WScript.Sleep 1500
WshShell.Run "http://localhost:28432"
