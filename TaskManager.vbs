Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' קבלת נתיב הסקריפט
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' שינוי תיקיית עבודה
objShell.CurrentDirectory = strPath

' בדיקה אם Node.js מותקן
On Error Resume Next
Set objExec = objShell.Exec("node --version")
If Err.Number <> 0 Then
    MsgBox "Node.js is not installed!" & vbCrLf & "Please install from https://nodejs.org/", vbCritical, "Error"
    WScript.Quit
End If
On Error GoTo 0

' בדיקה אם node_modules קיים
If Not objFSO.FolderExists(strPath & "\node_modules") Then
    ' הצגת הודעה
    objShell.Popup "Installing dependencies, please wait...", 3, "Task Manager 2025", 64
    ' התקנת תלויות
    objShell.Run "cmd /c npm install", 0, True
End If

' בדיקה אם השרת כבר רץ
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set colProcesses = objWMIService.ExecQuery("Select * from Win32_Process Where Name = 'node.exe'")
For Each objProcess in colProcesses
    If InStr(objProcess.CommandLine, "server.js") > 0 Then
        ' השרת כבר רץ, רק פותח דפדפן
        objShell.Run "http://localhost:10000"
        WScript.Quit
    End If
Next

' הרצת השרת ברקע
objShell.Run "cmd /c node server.js", 0, False

' המתנה קצרה
WScript.Sleep 10000

' פתיחת הדפדפן
objShell.Run "http://localhost:10000"

' יציאה
WScript.Quit
