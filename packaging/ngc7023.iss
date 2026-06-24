; Inno Setup script for NGC7023 (Windows installer).
;
; Prerequisites (run from the repo root first):
;   1. cd frontend && npm run build           (builds ngc7023/web)
;   2. .venv\Scripts\pyinstaller ngc7023.spec --noconfirm   (builds dist\ngc7023)
;   3. ffmpeg.exe, ffprobe.exe, yt-dlp.exe present in .\binaries
; Then compile this script:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\ngc7023.iss
; Output: dist\installer\NGC7023-Setup-<version>.exe
;
; Per-user install (no admin / UAC): installs to %LOCALAPPDATA%\Programs\NGC7023,
; matching the app's per-user "start with Windows" (HKCU) autostart.

#define MyAppName "NGC7023"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "viwctor"
#define MyAppURL "https://github.com/viwctor/NGC7023"
#define MyAppExeName "ngc7023.exe"

[Setup]
AppId={{9F5CF230-DA09-4940-BE18-1493597C578E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist\installer
OutputBaseFilename=NGC7023-Setup-{#MyAppVersion}
; The installer uses the ROUND icon; the app exe (and so the uninstall entry)
; embeds the SQUARE icon from the spec.
SetupIconFile=ngc7023-installer.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Branded wizard art as PNG (Inno 6.3+), so the small image can be transparent.
; Left banner = the arrow on a dark nebula, no text; small top-right = the bare
; arrow (blends into the light header). Comma-separated sizes are per-DPI.
WizardImageFile=wizard-large.png,wizard-large-150.png,wizard-large-200.png
WizardSmallImageFile=wizard-small.png,wizard-small-150.png,wizard-small-200.png
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; PyInstaller one-dir output (ngc7023.exe + _internal\). Must NOT contain a
; binaries\ folder — the sidecars are added from the repo's .\binaries below.
Source: "..\dist\ngc7023\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
; ffmpeg / ffprobe / yt-dlp, placed where bin.resolve() looks (<app>\binaries).
Source: "..\binaries\*"; DestDir: "{app}\binaries"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; The app may have registered an autostart entry (HKCU Run) and left a tray
; process; nothing here can remove a running process, but the Run key is HKCU
; and removed below.

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Registry]
; Clean up the optional "start with Windows" entry the app sets at runtime, so
; uninstalling doesn't leave a dangling autostart pointing at a deleted exe.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "ngc7023"; Flags: dontcreatekey uninsdeletevalue
