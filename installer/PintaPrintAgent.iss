#define AppName "Pinta Print Agent"
; AppVersion is supplied by ISCC /DMyAppVersion from package.json; do not put secrets here.
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

[Setup]
AppId={{4E6F27DB-95F9-4E1A-A7F1-3F42B2FA0741}
AppName={#AppName}
AppVersion={#MyAppVersion}
AppPublisher=Pinta
DefaultDirName={localappdata}\PintaPrintAgent
DefaultGroupName=Pinta Print Agent
OutputDir=..\release
OutputBaseFilename=PintaPrintAgent-Setup-{#MyAppVersion}
ArchitecturesInstallIn64BitMode=x64compatible
; The agent, its configuration, and its scheduled task belong to the interactive
; cashier account.  Do not elevate the whole Setup: an administrator credential
; would otherwise redirect {localappdata} to that administrator's profile.
PrivilegesRequired=lowest
; Inno Setup 6 supports commandline or dialog here (not "none"). Commandline
; removes the elevation-choice UI; ordinary launches therefore remain per-user.
PrivilegesRequiredOverridesAllowed=commandline
Compression=lzma2/ultra64
SolidCompression=yes
UninstallDisplayName=Pinta Print Agent
DisableProgramGroupPage=yes

[Files]
Source: "staging\app\*"; DestDir: "{localappdata}\PintaPrintAgent\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "staging\scripts\*"; DestDir: "{localappdata}\PintaPrintAgent\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\vendor\pos-driver\POS Printer Driver Setup V11.3.0.3.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{group}\Configurar Pinta Print Agent"; Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{localappdata}\PintaPrintAgent\scripts\configure.ps1"""
Name: "{group}\Imprimir prueba"; Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{localappdata}\PintaPrintAgent\scripts\test-print.ps1"""
Name: "{group}\Ver estado"; Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{localappdata}\PintaPrintAgent\scripts\diagnostic.ps1"""
Name: "{group}\Ver logs"; Filename: "explorer.exe"; Parameters: """{localappdata}\PintaPrintAgent\logs"""
Name: "{group}\Reiniciar agente"; Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{localappdata}\PintaPrintAgent\scripts\restart.ps1"""
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"

[Code]
var DriverPage: TInputOptionWizardPage;

function InitializeSetup(): Boolean;
begin
  { Keep even command-line privilege overrides from changing the owner of the
    user's LocalAppData, the Start Menu entries, or the uninstaller. }
  Result := not IsAdminInstallMode;
  if not Result then
    MsgBox('Pinta Print Agent debe instalarse como el usuario de caja, sin elevación. El driver POS solicitará permisos de administrador por separado si se selecciona.', mbError, MB_OK);
end;

procedure InitializeWizard;
begin
  DriverPage := CreateInputOptionPage(wpSelectDir, 'Driver POS', 'Instalación de impresora', 'Puede instalar o reinstalar el driver validado para la impresora POS.', False, False);
  DriverPage.Add('Instalar/reinstalar driver POS');
  DriverPage.SelectedValueIndex := 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if DriverPage.Values[0] then begin
      { The driver is the only privileged operation. ShellExec with runas starts
        a separate elevated process and leaves this per-user Setup unchanged. }
      if not ShellExec('runas', ExpandConstant('{tmp}\POS Printer Driver Setup V11.3.0.3.exe'), '', '', SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode) then
        MsgBox('No se pudo iniciar el instalador del driver POS.', mbError, MB_OK)
      else if ResultCode <> 0 then
        MsgBox('El instalador del driver POS terminó con código ' + IntToStr(ResultCode) + '. Verifique el driver antes de continuar.', mbInformation, MB_OK);
    end;
    Exec('powershell.exe', '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + ExpandConstant('{localappdata}\PintaPrintAgent\scripts\configure.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var ResultCode: Integer;
begin
  { Stop an existing task before replacing its private node.exe and app files. }
  Exec('schtasks.exe', '/End /TN "Pinta Print Agent"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
    Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{localappdata}\PintaPrintAgent\scripts\uninstall.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
