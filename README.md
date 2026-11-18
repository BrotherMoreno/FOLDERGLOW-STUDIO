<div align="center">

# FolderGlow Studio

**Cristal translúcido, dock, barra superior y widgets para tu escritorio de Windows.**

![Versión](https://img.shields.io/badge/versión-2.5.3-blue)
![Plataforma](https://img.shields.io/badge/plataforma-Windows-0078D6)
![Licencia](https://img.shields.io/badge/licencia-uso%20personal-lightgrey)

</div>

---

## ¿Qué es?

FolderGlow Studio convierte tu escritorio de Windows en algo más moderno y personalizable: efecto de cristal translúcido, un dock animado, una barra superior y widgets con temas listos para usar.

## Características

- **Cristal translúcido** sobre la barra de tareas y los widgets.
- **Dock** con zoom al pasar el mouse, tamaño ajustable y ocultado automático. Reemplaza la barra de Windows.
- **Barra superior** con la ventana activa, reloj y batería.
- **Widgets de escritorio** con temas predefinidos (*iPad Glass*, *Bosque* y más).
- **Lanzador rápido** de aplicaciones con atajo de teclado (por defecto `Alt+Space`).
- **Fondos de pantalla** incluidos.
- **Modo ahorro** para consumir menos recursos.

## Descarga e instalación

1. Ve a la sección **[Releases](../../releases)**.
2. Descarga una de las dos opciones:
   - `FolderGlow-Studio-Setup-x.y.z.exe`: instalador.
   - `FolderGlow-Studio-x.y.z-portable.exe`: versión portable, no necesita instalación.
3. Ábrelo y listo.

> **Nota:** el dock oculta la barra de tareas de Windows mientras está activo. Si cierras la app con normalidad, la barra vuelve a mostrarse.

## Requisitos

- Windows 10 u 11 (64 bits).

## Desarrollo

Solo para uso interno del autor y de quien tenga su permiso.

```bash
npm install
npm start        # modo desarrollo
npm run dist     # genera instalador y portable en dist/
```

Para publicar una versión, sube un tag y GitHub Actions compila los `.exe` y los adjunta al Release:

```bash
git tag v2.5.3
git push origin v2.5.3
```

## Estructura

| Ruta | Contenido |
|------|-----------|
| `main.js`, `preload.js`, `games.js` | Proceso principal |
| `renderer/` | Interfaz, dock, barra superior, widgets, lanzador |
| `tools/glowglass.exe` | Motor nativo (cristal, barra de tareas, ventanas) |
| `.github/workflows/build.yml` | Compilación automática en GitHub |

## Licencia

**Todos los derechos reservados.** Puedes descargar y usar FolderGlow Studio de forma gratuita para uso personal.

**No está permitido** venderlo, modificarlo, redistribuirlo ni reutilizar su código sin permiso escrito del autor. Que el código sea visible no significa que sea de uso libre.

Lee los términos completos en el archivo [LICENSE](LICENSE).

## Créditos

Creado por **Brother Moreno**. Hecho con [Electron](https://www.electronjs.org/). Fuentes *Press Start 2P* y *VT323* bajo licencia OFL.
