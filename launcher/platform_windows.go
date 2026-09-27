//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

// browserCandidates lists Chrome and Edge install locations. Chrome comes
// first; Edge ships with Windows, so one of them is almost always present.
func browserCandidates() []string {
	var out []string
	for _, env := range []string{"LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		out = append(out,
			filepath.Join(base, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(base, `Microsoft\Edge\Application\msedge.exe`),
		)
	}
	return out
}

// openAppWindow opens the app in a chrome-less "app" window of Chrome or Edge
// (using your normal browser profile, so your twitch.tv login and Turbo carry
// over), falling back to the default browser.
func openAppWindow(url string) error {
	for _, exe := range browserCandidates() {
		if _, err := os.Stat(exe); err == nil {
			cmd := exec.Command(exe, "--app="+url)
			if cmd.Start() == nil {
				return nil
			}
		}
	}
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// ensureDesktopShortcut adds "Multi Twitch Viewer" to the desktop the first
// time (or if the exe was moved), pointing at this exe.
func ensureDesktopShortcut() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	// Don't create shortcuts to a copy running from a temp/zip folder.
	if strings.Contains(strings.ToLower(exe), `\temp\`) {
		return
	}
	script := `$s=(New-Object -ComObject WScript.Shell);` +
		`$d=[Environment]::GetFolderPath('Desktop');` +
		`$p=Join-Path $d 'Multi Twitch Viewer.lnk';` +
		`if((Test-Path $p) -and ($s.CreateShortcut($p).TargetPath -eq $env:MTV_EXE)){exit};` +
		`$l=$s.CreateShortcut($p);$l.TargetPath=$env:MTV_EXE;` +
		`$l.WorkingDirectory=(Split-Path $env:MTV_EXE);$l.IconLocation=$env:MTV_EXE+',0';` +
		`$l.Description='Watch several Twitch streams at once';$l.Save()`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script)
	cmd.Env = append(os.Environ(), "MTV_EXE="+exe)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	_ = cmd.Run()
}

func showError(message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	text, _ := syscall.UTF16PtrFromString(message)
	title, _ := syscall.UTF16PtrFromString("Multi Twitch Viewer")
	const mbIconError = 0x10
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbIconError)
}
