// Écran de veille Jarvis (Suite MAG) : petit programme .scr qui lance « Suite MAG.exe --veille »
// et attend que la fenêtre de veille se ferme (mouvement de souris, clic ou touche).
//   /s            : lancer l'écran de veille (Windows)
//   /c            : configuration (message d'aide)
//   /p <hwnd>     : aperçu dans les Paramètres (rien : on quitte)
//   /installer N  : devenir l'écran de veille de Windows, après N minutes d'inactivité
//   /desinstaller : ne plus être l'écran de veille
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class JarvisVeille
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, IntPtr vparam, uint winIni);
    const uint SPI_SETSCREENSAVETIMEOUT = 15, SPI_SETSCREENSAVEACTIVE = 17, SPIF_UPDATEINIFILE = 1, SPIF_SENDCHANGE = 2;
    const string TITRE = "Jarvis veille";

    static string Suite()
    {
        string dir = Path.GetDirectoryName(Application.ExecutablePath);
        string[] l = {
            Path.Combine(Path.GetDirectoryName(dir) ?? dir, "Suite MAG.exe"),   // …\Suite MAG\resources\Jarvis.scr
            Path.Combine(dir, "Suite MAG.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Suite MAG", "Suite MAG.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Suite MAG", "Suite MAG.exe")
        };
        foreach (string p in l) if (File.Exists(p)) return p;
        return null;
    }

    [STAThread]
    static int Main(string[] a)
    {
        string arg = a.Length > 0 ? a[0].Trim().ToLowerInvariant() : "/c";
        if (arg.StartsWith("/p")) return 0;
        if (arg.StartsWith("/c"))
        {
            MessageBox.Show("Écran de veille Jarvis (Suite MAG)\n\nIl affiche le Fond Jarvis en plein écran. Bougez la souris ou appuyez sur une touche pour revenir.\n\nSes réglages (couleurs, modèle, panneaux) sont ceux du Fond Jarvis : bouton ⚙.", "Jarvis", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        if (arg == "/installer" || arg == "/desinstaller")
        {
            bool on = arg == "/installer";
            int min = 10; if (a.Length > 1) int.TryParse(a[1], out min); if (min < 1) min = 10;
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Control Panel\Desktop"))
            {
                if (on) { k.SetValue("SCRNSAVE.EXE", Application.ExecutablePath); k.SetValue("ScreenSaveTimeOut", (min * 60).ToString()); k.SetValue("ScreenSaveActive", "1"); }
                else { try { k.DeleteValue("SCRNSAVE.EXE"); } catch { } k.SetValue("ScreenSaveActive", "0"); }
            }
            if (on) SystemParametersInfo(SPI_SETSCREENSAVETIMEOUT, (uint)(min * 60), IntPtr.Zero, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
            SystemParametersInfo(SPI_SETSCREENSAVEACTIVE, on ? 1u : 0u, IntPtr.Zero, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
            return 0;
        }
        // /s ou double-clic : lancer la veille
        string exe = Suite();
        if (exe == null)
        {
            MessageBox.Show("Installez d'abord la Suite MAG (Suite-MAG-Installation.exe) : l'écran de veille Jarvis l'utilise.", "Jarvis", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
        if (FindWindow(null, TITRE) == IntPtr.Zero)
        {
            ProcessStartInfo si = new ProcessStartInfo(exe, "--veille");
            si.UseShellExecute = false;
            si.WorkingDirectory = Path.GetDirectoryName(exe);
            Process.Start(si);
        }
        bool vu = false;
        for (int i = 0; i < 80 && !vu; i++) { Thread.Sleep(250); vu = FindWindow(null, TITRE) != IntPtr.Zero; }
        while (vu && FindWindow(null, TITRE) != IntPtr.Zero) Thread.Sleep(300);
        return 0;
    }
}
