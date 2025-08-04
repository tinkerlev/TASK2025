' VBScript ליצירת קיצור דרך
Set objShell = CreateObject("WScript.Shell")
Set objShortcut = objShell.CreateShortcut("Task Manager 2025.lnk")

objShortcut.TargetPath = objShell.CurrentDirectory & "\start-app.bat"
objShortcut.WorkingDirectory = objShell.CurrentDirectory
objShortcut.IconLocation = objShell.CurrentDirectory & "\public\icons\app-icon.ico"
objShortcut.Description = "Task Manager 2025 - Click to start"
objShortcut.WindowStyle = 1
objShortcut.Save

MsgBox "Shortcut created successfully!", vbInformation, "Task Manager 2025"
