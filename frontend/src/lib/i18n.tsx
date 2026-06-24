// Minimal, dependency-free i18n. House rule: ALL user-facing text is lowercase,
// the one exception being the brand name, shown uppercase as "NGC7023". Language
// persists to localStorage and is changed from the menu (arquivo › preferências › idiomas).

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LANGS = ["pt", "en", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  pt: "português (br)",
  en: "english",
  es: "español",
};

const DICT = {
  // ── menu bar ───────────────────────────────────────────────
  "menu.file": { pt: "arquivo", en: "file", es: "archivo" },
  "menu.new": { pt: "novo", en: "new", es: "nuevo" },
  "menu.newDownload": { pt: "download", en: "download", es: "descarga" },
  "menu.newFile": { pt: "arquivo", en: "file", es: "archivo" },
  "menu.prefs": { pt: "preferências", en: "preferences", es: "preferencias" },
  "menu.langs": { pt: "idiomas", en: "languages", es: "idiomas" },
  "menu.theme": { pt: "tema", en: "theme", es: "tema" },
  "menu.shortcuts": { pt: "atalhos", en: "shortcuts", es: "atajos" },
  "menu.modules": { pt: "módulos", en: "modules", es: "módulos" },
  "tip.ytModule": {
    pt: "módulo bem específico de youtube que o desenvolvedor usa; vem desativado por padrão e é inútil para a maioria.",
    en: "a niche youtube tool the developer uses; off by default and useless for most users.",
    es: "módulo de youtube muy específico que usa el desarrollador; desactivado por defecto e inútil para la mayoría.",
  },
  "menu.about": { pt: "sobre", en: "about", es: "acerca" },
  "menu.settings": { pt: "configurações", en: "settings", es: "configuración" },
  "menu.video": { pt: "vídeo", en: "video", es: "vídeo" },
  "menu.download": { pt: "download", en: "download", es: "descarga" },
  "menu.converter": { pt: "conversor", en: "converter", es: "conversor" },
  "menu.pdf": { pt: "pdf", en: "pdf", es: "pdf" },
  "menu.destination": { pt: "escolher destino", en: "choose destination", es: "elegir destino" },
  "menu.cropArea": { pt: "recortar área", en: "crop area", es: "recortar área" },
  "menu.trimRange": { pt: "cortar trecho", en: "trim range", es: "recortar tramo" },
  "menu.codec": { pt: "codec de vídeo", en: "video codec", es: "códec de video" },
  "menu.gpu": { pt: "aceleração (gpu)", en: "acceleration (gpu)", es: "aceleración (gpu)" },
  "gpu.auto": { pt: "automático", en: "automatic", es: "automático" },
  "gpu.off": { pt: "desligado", en: "off", es: "desactivado" },
  "menu.font": { pt: "fonte", en: "font", es: "fuente" },

  // ── terminal screen ────────────────────────────────────────
  "term.tagline": {
    pt: "download e conversor",
    en: "download & converter",
    es: "descargador y conversor",
  },
  "term.presetsCleared": {
    pt: "predefinições limpas",
    en: "presets cleared",
    es: "preajustes limpiados",
  },
  "term.hintPre": { pt: "cole, arraste ou", en: "paste, drop or", es: "pega, arrastra o" },
  "term.hintChoose": { pt: "escolha um arquivo", en: "choose a file", es: "elige un archivo" },
  "term.detectLink": { pt: "link detectado → download", en: "link detected → download", es: "enlace detectado → descarga" },
  "term.detectFile": { pt: "arquivo detectado → conversão", en: "file detected → conversion", es: "archivo detectado → conversión" },
  "term.unknown": { pt: "comando inválido", en: "invalid command", es: "comando inválido" },
  "term.pasteBig": {
    pt: "arquivo grande demais para colar — arraste-o para a janela",
    en: "file too big to paste — drag it onto the window instead",
    es: "archivo demasiado grande para pegar — arrástralo a la ventana",
  },
  "term.pasteFail": { pt: "não consegui ler o conteúdo colado", en: "couldn't read the pasted content", es: "no se pudo leer el contenido pegado" },
  "term.needFolder": {
    pt: "escolha uma pasta de destino para o download",
    en: "choose a destination folder for the download",
    es: "elige una carpeta de destino para la descarga",
  },
  "term.pasteLink": { pt: "cole um link para baixar", en: "paste a link to download", es: "pega un enlace para descargar" },

  "wiz.outputMethod": { pt: "método de saída", en: "output method", es: "método de salida" },
  "wiz.back": { pt: "voltar", en: "back", es: "volver" },
  "wiz.cancel": { pt: "cancelar", en: "cancel", es: "cancelar" },

  "cmd.help": { pt: "comandos disponíveis", en: "available commands", es: "comandos disponibles" },
  "cmd.commands": { pt: "lista todos os comandos", en: "list every command", es: "lista todos los comandos" },
  "cmd.format": {
    pt: "define o formato da próxima ação",
    en: "set the next action's format",
    es: "define el formato de la próxima acción",
  },
  "cmd.pdf": { pt: "abre as opções de pdf", en: "open the pdf options", es: "abre las opciones de pdf" },
  "cmd.youtube": { pt: "abre as opções do youtube", en: "open the youtube options", es: "abre las opciones de youtube" },
  "cmd.video": {
    pt: "cria vídeos com imagem e áudio",
    en: "create videos from image and audio",
    es: "crea vídeos con imagen y audio",
  },
  "video.askImage": {
    pt: "envie a imagem (ou um vídeo) de capa",
    en: "send the cover image (or a video)",
    es: "envía la imagen (o un vídeo) de portada",
  },
  "video.askAudio": { pt: "agora envie o áudio", en: "now send the audio", es: "ahora envía el audio" },

  // ── subtitles (/sub, /leg) ──
  "cmd.sub": {
    pt: "anexa legendas a um vídeo",
    en: "attach subtitles to a video",
    es: "adjunta subtítulos a un vídeo",
  },
  "sub.askVideo": { pt: "anexe o vídeo", en: "attach the video", es: "adjunta el vídeo" },
  "sub.askFile": {
    pt: "agora anexe o arquivo de legenda",
    en: "now attach the subtitle file",
    es: "ahora adjunta el archivo de subtítulos",
  },
  "sub.delayQ": { pt: "a legenda está dessincronizada?", en: "is the subtitle out of sync?", es: "¿el subtítulo está desincronizado?" },
  "sub.askDelay": {
    pt: "atraso em segundos (+ atrasa, − adianta; aceita vírgula)",
    en: "delay in seconds (+ later, − earlier; comma accepted)",
    es: "retraso en segundos (+ retrasa, − adelanta; acepta coma)",
  },
  "sub.modeQ": { pt: "como aplicar a legenda?", en: "how to apply the subtitle?", es: "¿cómo aplicar el subtítulo?" },
  "sub.soft": {
    pt: "embutir (faixa de legenda selecionável)",
    en: "soft embed (selectable track)",
    es: "incrustar (pista seleccionable)",
  },
  "sub.burn": {
    pt: "burn-in (legenda dentro do vídeo)",
    en: "burn-in (subtitle inside the video)",
    es: "burn-in (subtítulo dentro del vídeo)",
  },
  "cmd.exit": { pt: "fecha o programa", en: "close the app", es: "cierra el programa" },
  "cmd.formatSet": {
    pt: "formato da próxima ação definido — cole, arraste ou escolha",
    en: "next-action format set — paste, drop or choose",
    es: "formato de la próxima acción definido — pega, arrastra o elige",
  },
  "cmd.unknown": { pt: "comando desconhecido", en: "unknown command", es: "comando desconocido" },

  // ── about modal ────────────────────────────────────────────
  "about.title": { pt: "sobre", en: "about", es: "acerca" },

  // ── shortcuts modal ────────────────────────────────────────
  "shortcuts.title": { pt: "atalhos", en: "shortcuts", es: "atajos" },
  "sc.submit": { pt: "executar ação", en: "run action", es: "ejecutar acción" },
  "sc.newline": { pt: "nova linha (vários itens)", en: "new line (multiple items)", es: "nueva línea (varios)" },
  "sc.history": { pt: "histórico (anterior/próximo)", en: "history (prev/next)", es: "historial (ant./sig.)" },
  "sc.clear": { pt: "limpar tela", en: "clear screen", es: "limpiar pantalla" },
  "sc.focus": { pt: "focar a entrada", en: "focus input", es: "enfocar entrada" },
  "sc.paste": { pt: "colar (link ou caminho)", en: "paste (link or path)", es: "pegar (enlace o ruta)" },
  "sc.clearPresets": { pt: "limpar predefinições", en: "clear presets", es: "limpiar preajustes" },

  // ── download ───────────────────────────────────────────────
  "download.title": { pt: "download", en: "download", es: "descarga" },
  "download.kind": { pt: "tipo", en: "type", es: "tipo" },
  "download.video": { pt: "vídeo", en: "video", es: "vídeo" },
  "download.audio": { pt: "áudio", en: "audio", es: "audio" },
  "download.image": { pt: "imagem", en: "image", es: "imagen" },
  "download.format": { pt: "formato", en: "format", es: "formato" },
  "download.quality": { pt: "qualidade", en: "quality", es: "calidad" },

  // ── converter ──────────────────────────────────────────────
  "convert.title": { pt: "conversor", en: "converter", es: "conversor" },
  "convert.output": { pt: "saída", en: "output", es: "salida" },
  "convert.left": { pt: "esq.", en: "left", es: "izq." },
  "convert.top": { pt: "topo", en: "top", es: "sup." },
  "convert.width": { pt: "largura", en: "width", es: "ancho" },
  "convert.height": { pt: "altura", en: "height", es: "alto" },
  "convert.start": { pt: "início", en: "start", es: "inicio" },
  "convert.end": { pt: "fim", en: "end", es: "fin" },
  "convert.speed": { pt: "velocidade", en: "speed", es: "velocidad" },
  "convert.fps": { pt: "fps", en: "fps", es: "fps" },
  "convert.scale": { pt: "escala (altura px)", en: "scale (height px)", es: "escala (alto px)" },
  "conv.pdfImagesOnly": {
    pt: "só dá pra criar pdf a partir de imagens",
    en: "a pdf can only be made from images",
    es: "solo se puede crear un pdf a partir de imágenes",
  },
  "conv.pdfInput": {
    pt: "para trabalhar com pdf, use /pdf (pdf → imagem, juntar, páginas…)",
    en: "to work with pdf files use /pdf (pdf → image, merge, pages…)",
    es: "para archivos pdf usa /pdf (pdf → imagen, unir, páginas…)",
  },
  "conv.audioNoVisual": {
    pt: "não dá pra gerar imagem ou vídeo a partir de um áudio",
    en: "can't make an image or video out of audio",
    es: "no se puede generar imagen o vídeo a partir de audio",
  },
  "conv.noAudio": {
    pt: "uma imagem não tem áudio para extrair",
    en: "an image has no audio to extract",
    es: "una imagen no tiene audio para extraer",
  },
  "conv.imageNoVideo": {
    pt: "não dá pra fazer um vídeo a partir de uma imagem",
    en: "can't make a video out of an image",
    es: "no se puede hacer un vídeo a partir de una imagen",
  },
  "conv.mixedTypes": {
    pt: "não dá pra converter esses arquivos juntos (tipos incompatíveis)",
    en: "can't convert these files together (incompatible types)",
    es: "no se pueden convertir estos archivos juntos (tipos incompatibles)",
  },

  // ── youtube* (private) ─────────────────────────────────────
  "cover.tab": { pt: "youtube", en: "youtube", es: "youtube" },
  "cover.image": { pt: "inserir capa", en: "insert cover", es: "insertar portada" },
  "cover.audio": { pt: "áudio", en: "audio", es: "audio" },
  "cover.layout": { pt: "formato", en: "layout", es: "formato" },
  "cover.square": { pt: "1:1", en: "1:1", es: "1:1" },
  "cover.wide": { pt: "16:9", en: "16:9", es: "16:9" },
  "cover.fit": { pt: "ajustar à imagem", en: "fit image", es: "ajustar a la imagen" },
  "cover.blurred": { pt: "fundo desfocado", en: "blurred background", es: "fondo desenfocado" },
  "cover.copyAudio": { pt: "lossless audio", en: "lossless audio", es: "lossless audio" },
  "cover.normalize": { pt: "normalizar volume", en: "normalize loudness", es: "normalizar volumen" },
  "cover.render": { pt: "gerar vídeo", en: "render video", es: "generar vídeo" },

  // ── settings labels (reused in about) ──────────────────────
  "settings.system": { pt: "sistema", en: "system", es: "sistema" },
  "settings.tools": { pt: "ferramentas", en: "tools", es: "herramientas" },
  "settings.os": { pt: "so", en: "os", es: "so" },
  "settings.cpu": { pt: "cpu", en: "cpu", es: "cpu" },
  "settings.gpu": { pt: "gpu", en: "gpu", es: "gpu" },
  "settings.ram": { pt: "ram", en: "ram", es: "ram" },
  "settings.hwaccel": { pt: "aceleração por gpu", en: "gpu acceleration", es: "aceleración por gpu" },
  "settings.none": { pt: "nenhuma detectada", en: "none detected", es: "ninguna detectada" },
  "settings.notFound": { pt: "não encontrado", en: "not found", es: "no encontrado" },
  "settings.detecting": { pt: "detectando…", en: "detecting…", es: "detectando…" },
  "settings.creditPre": { pt: "desenvolvido com", en: "developed with", es: "desarrollado con" },
  "settings.creditBy": { pt: "por", en: "by", es: "por" },

  // ── pdf tools ──────────────────────────────────────────────
  "pdf.title": { pt: "ferramentas de pdf", en: "pdf tools", es: "herramientas de pdf" },
  "pdf.imageToPdf": { pt: "imagem → pdf", en: "image → pdf", es: "imagen → pdf" },
  "pdf.imagesToPdf": { pt: "imagens → pdf", en: "images → pdf", es: "imágenes → pdf" },
  "pdf.toPng": { pt: "pdf → png", en: "pdf → png", es: "pdf → png" },
  "pdf.toJpg": { pt: "pdf → jpg", en: "pdf → jpg", es: "pdf → jpg" },
  "pdf.extract": { pt: "extrair páginas", en: "extract pages", es: "extraer páginas" },
  "pdf.askPages": {
    pt: "quais páginas? (ex.: 2-5, 8)",
    en: "which pages? (e.g. 2-5, 8)",
    es: "¿qué páginas? (ej.: 2-5, 8)",
  },
  "pdf.deletePages": { pt: "excluir páginas", en: "delete pages", es: "eliminar páginas" },
  "pdf.merge": { pt: "juntar pdfs", en: "merge pdfs", es: "unir pdfs" },

  // ── common ─────────────────────────────────────────────────
  "common.close": { pt: "fechar", en: "close", es: "cerrar" },
  "common.copy": { pt: "copiar", en: "copy", es: "copiar" },
  "common.queued": { pt: "na fila", en: "queued", es: "en cola" },
  "common.on": { pt: "ativado", en: "on", es: "activado" },
  "common.auto": { pt: "auto", en: "auto", es: "auto" },
  "common.yes": { pt: "sim", en: "yes", es: "sí" },
  "common.no": { pt: "não", en: "no", es: "no" },
  "common.cancelled": { pt: "cancelado", en: "cancelled", es: "cancelado" },

  "cmd.open": { pt: "abre a pasta de destino", en: "open the destination folder", es: "abre la carpeta de destino" },
  "cmd.cancel": { pt: "cancela tudo na fila", en: "cancel everything in the queue", es: "cancela todo en la cola" },
  "term.noDest": { pt: "nenhuma pasta de destino ainda", en: "no destination folder yet", es: "aún no hay carpeta de destino" },

  "job.openHint": { pt: "abrir pasta", en: "open folder", es: "abrir carpeta" },
  "job.cancelHint": { pt: "cancelar", en: "cancel", es: "cancelar" },

  "notify.done": { pt: "concluído", en: "done", es: "completado" },
  "notify.failed": { pt: "falhou", en: "failed", es: "falló" },

  "err.generic": { pt: "falhou", en: "failed", es: "falló" },
  "err.forbidden": { pt: "acesso negado pela fonte (403)", en: "access denied by source (403)", es: "acceso denegado por la fuente (403)" },
  "err.rateLimited": { pt: "muitas requisições — tente mais tarde", en: "too many requests — try later", es: "demasiadas solicitudes — intenta luego" },
  "err.private": { pt: "vídeo privado", en: "private video", es: "vídeo privado" },
  "err.unavailable": { pt: "vídeo indisponível", en: "video unavailable", es: "vídeo no disponible" },
  "err.ageRestricted": { pt: "requer login / restrição de idade", en: "requires login / age-restricted", es: "requiere inicio de sesión / edad" },
  "err.noFormat": { pt: "formato indisponível para esta fonte", en: "format unavailable for this source", es: "formato no disponible para esta fuente" },
  "err.unsupportedUrl": { pt: "link não suportado", en: "unsupported link", es: "enlace no soportado" },
  "err.toolMissing": { pt: "ferramenta não encontrada (ffmpeg/yt-dlp)", en: "tool not found (ffmpeg/yt-dlp)", es: "herramienta no encontrada (ffmpeg/yt-dlp)" },
  "err.noFile": { pt: "arquivo não encontrado", en: "file not found", es: "archivo no encontrado" },
  "err.convertImpossible": { pt: "conversão impossível para este formato", en: "conversion not possible for this format", es: "conversión imposible para este formato" },
  "err.network": { pt: "erro de rede", en: "network error", es: "error de red" },

  "speed.custom": { pt: "personalizado", en: "custom", es: "personalizado" },

  // ── detailed conversion wizard (slash /<format> + a file) ──
  "wiz.keep": { pt: "manter", en: "keep", es: "mantener" },
  "wiz.other": { pt: "outro…", en: "other…", es: "otro…" },
  "wiz.resolution": { pt: "resolução (altura px)", en: "resolution (height px)", es: "resolución (alto px)" },
  "wiz.askHeight": { pt: "altura em px (ex.: 720)", en: "height in px (e.g. 720)", es: "alto en px (ej.: 720)" },
  "wiz.askFps": { pt: "fps (ex.: 30)", en: "fps (e.g. 30)", es: "fps (ej.: 30)" },
  "wiz.crop": { pt: "recortar área?", en: "crop area?", es: "¿recortar área?" },
  "wiz.noCrop": { pt: "não recortar", en: "no crop", es: "sin recorte" },
  "wiz.doCrop": { pt: "recortar…", en: "crop…", es: "recortar…" },
  "wiz.askCrop": {
    pt: "largura altura x y (ex.: 640 480 0 0)",
    en: "width height x y (e.g. 640 480 0 0)",
    es: "ancho alto x y (ej.: 640 480 0 0)",
  },
  "wiz.trim": { pt: "cortar trecho?", en: "trim a range?", es: "¿recortar tramo?" },
  "wiz.full": { pt: "vídeo completo", en: "full video", es: "vídeo completo" },
  "wiz.doTrim": { pt: "cortar trecho…", en: "trim…", es: "recortar tramo…" },
  "wiz.askTrimStart": {
    pt: "início — ex.: 00:00:05 (0 = começo)",
    en: "start — e.g. 00:00:05 (0 = beginning)",
    es: "inicio — ej.: 00:00:05 (0 = principio)",
  },
  "wiz.askTrimEnd": {
    pt: "fim — ex.: 00:01:30",
    en: "end — e.g. 00:01:30",
    es: "fin — ej.: 00:01:30",
  },
  "wiz.speedNormal": { pt: "1x (normal)", en: "1x (normal)", es: "1x (normal)" },
  "wiz.askSpeed": {
    pt: "ex.: 2 (mais rápido) ou 0.5 (câmera lenta) — aceita vírgula",
    en: "e.g. 2 (faster) or 0.5 (slow motion) — comma accepted",
    es: "ej.: 2 (más rápido) o 0.5 (cámara lenta) — acepta coma",
  },

  // ── tutorial (/help) + first-run welcome ──
  "help.download": {
    pt: "baixar: cole um link (youtube, x, tiktok…) e escolha vídeo ou áudio",
    en: "download: paste a link (youtube, x, tiktok…) and pick video or audio",
    es: "descargar: pega un enlace (youtube, x, tiktok…) y elige vídeo o audio",
  },
  "help.convert": {
    pt: "converter: arraste um arquivo e escolha o formato de saída",
    en: "convert: drop a file and choose the output format",
    es: "convertir: arrastra un archivo y elige el formato de salida",
  },
  "help.detailed": {
    pt: "opções detalhadas: digite /mp4 (ou /gif, /mp3…) e então solte o arquivo — ajusta resolução, fps, recorte e mais",
    en: "detailed options: type /mp4 (or /gif, /mp3…) then drop the file — set resolution, fps, crop and more",
    es: "opciones detalladas: escribe /mp4 (o /gif, /mp3…) y suelta el archivo — ajusta resolución, fps, recorte y más",
  },
  "help.pdfLine": {
    pt: "pdf: digite /pdf para juntar, dividir e converter páginas",
    en: "pdf: type /pdf to merge, split and convert pages",
    es: "pdf: escribe /pdf para unir, dividir y convertir páginas",
  },
  "help.shortcutsLine": {
    pt: "atalhos: enter executa · ctrl+l limpa a tela · / foca o prompt",
    en: "shortcuts: enter runs · ctrl+l clears the screen · / focuses the prompt",
    es: "atajos: enter ejecuta · ctrl+l limpia la pantalla · / enfoca el prompt",
  },
  "welcome.hello": {
    pt: "bem-vindo ao ngc7023 — arraste um arquivo ou cole um link. digite /help para o guia.",
    en: "welcome to ngc7023 — drop a file or paste a link. type /help for the guide.",
    es: "bienvenido a ngc7023 — arrastra un archivo o pega un enlace. escribe /help para la guía.",
  },

  // ── settings slash commands (replace the top menu) ──
  "cmd.theme": { pt: "muda o tema de cores", en: "change the color theme", es: "cambia el tema de color" },
  "cmd.lang": { pt: "muda o idioma", en: "change the language", es: "cambia el idioma" },
  "cmd.font": { pt: "tamanho da fonte do terminal", en: "terminal font size", es: "tamaño de fuente del terminal" },
  "cmd.codec": { pt: "codec de vídeo para conversões", en: "video codec for conversions", es: "códec de video para conversiones" },
  "cmd.gpu": { pt: "aceleração por gpu", en: "gpu acceleration", es: "aceleración por gpu" },
  "cmd.dest": {
    pt: "define a pasta de destino",
    en: "set the destination folder",
    es: "define la carpeta de destino",
  },
  "cmd.download": {
    pt: "predefine tipo, formato e qualidade do download",
    en: "preset download type, format and quality",
    es: "predefine tipo, formato y calidad de descarga",
  },
  "cmd.quality": { pt: "qualidade do download", en: "download quality", es: "calidad de descarga" },
  "cmd.modules": {
    pt: "ativa/desativa módulos (pdf, youtube)",
    en: "toggle modules (pdf, youtube)",
    es: "activa/desactiva módulos (pdf, youtube)",
  },
  "cmd.about": { pt: "informações do sistema e sobre", en: "system info & about", es: "información del sistema y acerca" },
  "cmd.shortcuts": { pt: "lista os atalhos de teclado", en: "list keyboard shortcuts", es: "lista los atajos de teclado" },
  "cmd.reset": { pt: "restaura o aplicativo ao padrão", en: "reset the app to defaults", es: "restablece la app a los valores por defecto" },
  "cmd.setTo": { pt: "definido", en: "set to", es: "definido" },
  "cmd.badValue": { pt: "valor inválido", en: "invalid value", es: "valor inválido" },

  // ── entry screen + help button ──
  "menu.help": { pt: "ajuda", en: "help", es: "ayuda" },
  "intro.pre": { pt: "clique em", en: "click", es: "haz clic en" },
  "intro.help": { pt: "ajuda", en: "help", es: "ayuda" },
  "intro.post": {
    pt: "ou aperte F1 para ver os comandos disponíveis",
    en: "or press F1 to see the available commands",
    es: "o pulsa F1 para ver los comandos disponibles",
  },

  // ── settings window ──
  "settings.title": { pt: "configurações", en: "settings", es: "configuración" },
  "settings.behavior": { pt: "comportamento", en: "behavior", es: "comportamiento" },
  "settings.tray": {
    pt: "minimizar para a bandeja do sistema",
    en: "minimize to the system tray",
    es: "minimizar a la bandeja del sistema",
  },
  "settings.autostart": {
    pt: "abrir ao iniciar o windows (na bandeja)",
    en: "start with windows (in the tray)",
    es: "iniciar con windows (en la bandeja)",
  },
  "settings.reduceMotion": { pt: "remover animações", en: "disable animations", es: "quitar animaciones" },
  "settings.defaultDir": { pt: "diretório padrão", en: "default folder", es: "carpeta por defecto" },
  "settings.chooseDir": { pt: "escolher pasta", en: "choose folder", es: "elegir carpeta" },
  "settings.checkUpdates": { pt: "verificar atualizações", en: "check for updates", es: "buscar actualizaciones" },
  "settings.checking": { pt: "verificando…", en: "checking…", es: "buscando…" },
  "settings.upToDate": { pt: "você está na versão mais recente", en: "you're on the latest version", es: "tienes la última versión" },
  "settings.updateAvailable": { pt: "nova versão disponível", en: "new version available", es: "nueva versión disponible" },
  "settings.download": { pt: "baixar", en: "download", es: "descargar" },
  "settings.updateError": { pt: "não foi possível verificar", en: "couldn't check", es: "no se pudo verificar" },
  "settings.updateNoRepo": { pt: "repositório ainda não configurado", en: "repository not configured yet", es: "repositorio aún no configurado" },
  "settings.reset": { pt: "resetar aplicativo", en: "reset the app", es: "restablecer la app" },
  "settings.resetConfirm": {
    pt: "resetar tudo ao padrão e reiniciar?",
    en: "reset everything to defaults and restart?",
    es: "¿restablecer todo y reiniciar?",
  },
  "common.confirm": { pt: "confirmar", en: "confirm", es: "confirmar" },
  "common.cancel": { pt: "cancelar", en: "cancel", es: "cancelar" },
  "help.modalTitle": { pt: "como usar", en: "how to use", es: "cómo usar" },
  "help.cmdsTitle": { pt: "comandos", en: "commands", es: "comandos" },

  // ── "definido para" confirmation messages ──
  "set.theme": { pt: "tema definido para", en: "theme set to", es: "tema definido a" },
  "set.lang": { pt: "idioma definido para", en: "language set to", es: "idioma definido a" },
  "set.font": { pt: "fonte definida para", en: "font set to", es: "fuente definida a" },

  // ── about / credits (text command) ──
  "about.credits": { pt: "créditos", en: "credits", es: "créditos" },

  // ── help modal content ──
  "help.dlLabel": { pt: "baixar", en: "download", es: "descargar" },
  "help.dlDesc": {
    pt: "cole um link e escolha o formato desejado.",
    en: "paste a link and pick the format you want.",
    es: "pega un enlace y elige el formato deseado.",
  },
  "help.cvLabel": { pt: "converter", en: "convert", es: "convertir" },
  "help.cvDesc": {
    pt: "arraste ou anexe um arquivo e escolha o formato desejado.",
    en: "drop or attach a file and pick the format you want.",
    es: "arrastra o adjunta un archivo y elige el formato deseado.",
  },
  "help.extLabel": { pt: "converter estendido", en: "extended convert", es: "conversión detallada" },
  "help.extDesc": {
    pt: "digite '/' seguido do formato (ex.: /mp4, /gif…) e então inclua o arquivo para ajustar resolução, fps, recorte, velocidade e mais.",
    en: "type '/' then the format (e.g. /mp4, /gif…) and add the file to set resolution, fps, crop, speed and more.",
    es: "escribe '/' y el formato (ej.: /mp4, /gif…) e incluye el archivo para ajustar resolución, fps, recorte, velocidad y más.",
  },
  "help.scEnter": { pt: "executa o comando", en: "run the command", es: "ejecuta el comando" },
  "help.scNewline": {
    pt: "quebra de linha (vários arquivos)",
    en: "new line (multiple files)",
    es: "salto de línea (varios archivos)",
  },
  "help.scClear": { pt: "limpa o console", en: "clear the console", es: "limpia la consola" },
  "help.scHelp": { pt: "abre a ajuda", en: "open help", es: "abre la ayuda" },
  "help.scSlash": { pt: "comandos", en: "commands", es: "comandos" },
  "help.dismiss": {
    pt: "pressione qualquer tecla para fechar",
    en: "press any key to close",
    es: "pulsa cualquier tecla para cerrar",
  },

  "term.checkingLink": { pt: "verificando o link…", en: "checking the link…", es: "verificando el enlace…" },

  // ── reset confirmation ──
  "reset.confirm": {
    pt: "restaurar o aplicativo ao padrão? (y/n)",
    en: "reset the app to defaults? (y/n)",
    es: "¿restablecer la app a los valores por defecto? (y/n)",
  },
} satisfies Record<string, Record<Lang, string>>;

export type TKey = keyof typeof DICT;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const Ctx = createContext<I18nCtx | null>(null);
const STORAGE_KEY = "ngc7023.lang";

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (saved && LANGS.includes(saved)) return saved;
  // Ship in English by default; the first-run picker lets the user switch.
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<I18nCtx>(
    () => ({ lang, setLang, t: (key) => DICT[key][lang] }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
