[Setup]
AppName=Luai.io
AppVersion=1.0
DefaultDirName={autopf}\Luai.io
DefaultGroupName=Luai.io
OutputDir=.\Output
OutputBaseFilename=Luai.io_Setup
Compression=lzma
SolidCompression=yes
SetupIconFile=Source\appicon.ico
UninstallDisplayIcon={app}\appicon.ico
WizardStyle=modern
[Dirs]
Name: "{app}"
[Files]
Source: "Source\task-manager.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "Source\launcher.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "Source\start-task-manager.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "Source\appicon.ico"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\Luai.io"; Filename: "{app}\start-task-manager.vbs"; IconFilename: "{app}\appicon.ico"
Name: "{commondesktop}\Luai.io"; Filename: "{app}\start-task-manager.vbs"; Tasks: desktopicon; IconFilename: "{app}\appicon.ico"
[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:";
[Run]
Filename: "{app}\start-task-manager.vbs"; Description: "Launch Luai.io now"; Flags: nowait postinstall shellexec