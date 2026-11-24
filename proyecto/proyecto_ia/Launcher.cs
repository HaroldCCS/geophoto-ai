using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using System.Threading;
using System.Drawing;
using System.Windows.Forms;

namespace GeoPhotoAI
{
    static class Program
    {
        private static HttpListener listener;
        private static NotifyIcon trayIcon;
        private static string appUrl;
        private static Process browserProcess;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                // 1. Determinar ruta de la carpeta 'app'
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string appDir = Path.Combine(exeDir, "app");

                if (!Directory.Exists(appDir))
                {
                    string parentApp = Path.GetFullPath(Path.Combine(exeDir, "..", "app"));
                    if (Directory.Exists(parentApp))
                    {
                        appDir = parentApp;
                    }
                    else
                    {
                        MessageBox.Show(
                            "No se encontró la carpeta 'app' requerida junto a GeoPhotoAI.exe.\n\n" +
                            "Asegúrate de copiar la carpeta completa del proyecto que contiene 'GeoPhotoAI.exe' y la carpeta 'app'.",
                            "GeoPhoto AI - Carpeta Requerida",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning
                        );
                        return;
                    }
                }

                // 2. Iniciar servidor HTTP en un puerto local disponible (8080 - 8120)
                int port = 8080;
                for (int p = 8080; p <= 8120; p++)
                {
                    try
                    {
                        var candidate = new HttpListener();
                        candidate.Prefixes.Add("http://127.0.0.1:" + p + "/");
                        candidate.Start();
                        listener = candidate;
                        port = p;
                        break;
                    }
                    catch
                    {
                        // Puerto ocupado, probar siguiente
                    }
                }

                if (listener == null)
                {
                    MessageBox.Show(
                        "No se pudo reservar un puerto local (8080-8120) para el servidor de GeoPhoto AI.\n" +
                        "Verifica que ningún programa bloquee las conexiones locales a 127.0.0.1.",
                        "GeoPhoto AI - Error de Red Local",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                appUrl = "http://127.0.0.1:" + port + "/";

                // 3. Iniciar hilo del servidor HTTP
                Thread serverThread = new Thread(() =>
                {
                    while (listener != null && listener.IsListening)
                    {
                        try
                        {
                            var context = listener.GetContext();
                            ThreadPool.QueueUserWorkItem((_) => ServeFile(context, appDir));
                        }
                        catch
                        {
                            break;
                        }
                    }
                });
                serverThread.IsBackground = true;
                serverThread.Start();

                // 4. Configurar icono en la bandeja del sistema (System Tray)
                SetupTrayIcon(exeDir);

                // 5. Lanzar ventana de la aplicación (Edge en modo App o navegador predeterminado)
                LaunchDesktopWindow(appUrl);

                // 6. Iniciar ciclo de mensajes de Windows
                Application.Run();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error al iniciar GeoPhoto AI:\n\n" + ex.Message,
                    "GeoPhoto AI - Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            finally
            {
                Cleanup();
            }
        }

        static void SetupTrayIcon(string exeDir)
        {
            trayIcon = new NotifyIcon();

            string icoPath = Path.Combine(exeDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try
                {
                    trayIcon.Icon = new Icon(icoPath);
                }
                catch
                {
                    trayIcon.Icon = SystemIcons.Application;
                }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            trayIcon.Text = "GeoPhoto AI (" + appUrl + ")";
            trayIcon.Visible = true;

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Abrir GeoPhoto AI", (s, e) => OpenInBrowser(appUrl));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Cerrar GeoPhoto AI", (s, e) => ExitApplication());
            trayIcon.ContextMenu = menu;

            trayIcon.DoubleClick += (s, e) => OpenInBrowser(appUrl);

            try
            {
                trayIcon.BalloonTipTitle = "GeoPhoto AI";
                trayIcon.BalloonTipText = "GeoPhoto AI está activo en " + appUrl;
                trayIcon.BalloonTipIcon = ToolTipIcon.Info;
                trayIcon.ShowBalloonTip(2500);
            }
            catch { }
        }

        static void LaunchDesktopWindow(string url)
        {
            // Intentar Edge en modo App (--app=...)
            string[] possibleEdgePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
            };

            string edgeExe = null;
            foreach (string p in possibleEdgePaths)
            {
                if (File.Exists(p))
                {
                    edgeExe = p;
                    break;
                }
            }

            if (edgeExe != null)
            {
                string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GeoPhotoAI_AppProfile");
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = edgeExe,
                    Arguments = "--app=\"" + url + "\" --user-data-dir=\"" + profileDir + "\"",
                    UseShellExecute = false
                };

                try
                {
                    browserProcess = Process.Start(psi);
                    if (browserProcess != null)
                    {
                        browserProcess.EnableRaisingEvents = true;
                        browserProcess.Exited += (s, e) =>
                        {
                            // Cuando el usuario cierra la ventana de la app en modo Edge, cerramos la aplicación
                            ExitApplication();
                        };
                        return;
                    }
                }
                catch { }
            }

            // Fallback: abrir en el navegador web predeterminado
            OpenInBrowser(url);
        }

        static void OpenInBrowser(string url)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "No se pudo abrir el navegador web:\n" + ex.Message + "\n\nPuedes abrir manualmente:\n" + url,
                    "GeoPhoto AI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }

        static void ExitApplication()
        {
            try
            {
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                    trayIcon = null;
                }
            }
            catch { }

            try
            {
                if (listener != null)
                {
                    listener.Stop();
                    listener.Close();
                    listener = null;
                }
            }
            catch { }

            try
            {
                Application.Exit();
            }
            catch { }
        }

        static void Cleanup()
        {
            try
            {
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
            }
            catch { }

            try
            {
                if (listener != null)
                {
                    listener.Close();
                }
            }
            catch { }
        }

        static void ServeFile(HttpListenerContext context, string baseDir)
        {
            var req = context.Request;
            var resp = context.Response;

            try
            {
                string rawPath = req.Url.AbsolutePath;
                if (rawPath == "/" || string.IsNullOrEmpty(rawPath))
                {
                    rawPath = "/index.html";
                }

                // Decodificar caracteres como %20 en la ruta
                rawPath = Uri.UnescapeDataString(rawPath);
                rawPath = rawPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string filePath = Path.Combine(baseDir, rawPath);

                // Validación de seguridad para evitar path traversal
                string fullPath = Path.GetFullPath(filePath);
                string fullBase = Path.GetFullPath(baseDir);
                if (!fullPath.StartsWith(fullBase, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                {
                    resp.StatusCode = 404;
                    byte[] notFoundBytes = System.Text.Encoding.UTF8.GetBytes("404 - Archivo no encontrado en GeoPhoto AI");
                    resp.ContentType = "text/plain; charset=utf-8";
                    resp.OutputStream.Write(notFoundBytes, 0, notFoundBytes.Length);
                    resp.Close();
                    return;
                }

                string ext = Path.GetExtension(fullPath).ToLowerInvariant();
                resp.ContentType = GetMime(ext);
                resp.AddHeader("Access-Control-Allow-Origin", "*");

                if (ext == ".html" || ext == ".js")
                {
                    resp.AddHeader("Cache-Control", "no-cache");
                }
                else
                {
                    resp.AddHeader("Cache-Control", "public, max-age=3600");
                }

                if (Path.GetFileName(fullPath) == "sw.js")
                {
                    resp.AddHeader("Service-Worker-Allowed", "/");
                }

                byte[] fileBytes = File.ReadAllBytes(fullPath);
                resp.ContentLength64 = fileBytes.Length;
                resp.OutputStream.Write(fileBytes, 0, fileBytes.Length);
                resp.Close();
            }
            catch
            {
                try { resp.Close(); } catch { }
            }
        }

        static string GetMime(string ext)
        {
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js":
                case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".webmanifest": return "application/manifest+json; charset=utf-8";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                case ".xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                case ".pdf": return "application/pdf";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".ttf": return "font/ttf";
                default: return "application/octet-stream";
            }
        }
    }
}
