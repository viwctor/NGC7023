// Short hover explanations for less-common menu options (formats, GPU families,
// editing tools). Surfaced as native `title` tooltips (show after a hover delay).

import type { Lang } from "./i18n";

const TIPS: Record<string, Record<Lang, string>> = {
  // ── formats ───────────────────────────────────────────────
  opus: {
    pt: "áudio moderno: ótima qualidade em arquivos pequenos (web/voz).",
    en: "modern audio: great quality at tiny sizes (web/voice).",
    es: "audio moderno: gran calidad en archivos pequeños (web/voz).",
  },
  webm: {
    pt: "vídeo aberto da web (vp9/av1); bom pra navegador, menor que mp4.",
    en: "open web video (vp9/av1); browser-friendly, smaller than mp4.",
    es: "vídeo abierto web (vp9/av1); ideal para navegador, más pequeño que mp4.",
  },
  mov: {
    pt: "container apple/quicktime; comum em câmeras e no mac.",
    en: "apple/quicktime container; common on cameras and macs.",
    es: "contenedor apple/quicktime; común en cámaras y mac.",
  },
  avi: {
    pt: "container antigo do windows; muito compatível, arquivos maiores.",
    en: "old windows container; very compatible, larger files.",
    es: "contenedor antiguo de windows; muy compatible, archivos grandes.",
  },
  ts: {
    pt: "transport stream; usado em transmissão/gravação de tv.",
    en: "transport stream; used for tv broadcast/capture.",
    es: "transport stream; usado en transmisión/grabación de tv.",
  },
  m4a: {
    pt: "áudio aac em container mp4; ótimo pra apple/ios.",
    en: "aac audio in an mp4 container; great for apple/ios.",
    es: "audio aac en contenedor mp4; ideal para apple/ios.",
  },
  flac: {
    pt: "áudio sem perdas (lossless); qualidade total, arquivos grandes.",
    en: "lossless audio; full quality, large files.",
    es: "audio sin pérdidas (lossless); calidad total, archivos grandes.",
  },
  wav: {
    pt: "áudio sem compressão (pcm); enorme, máxima compatibilidade.",
    en: "uncompressed audio (pcm); huge, maximum compatibility.",
    es: "audio sin comprimir (pcm); enorme, máxima compatibilidad.",
  },
  alac: {
    pt: "áudio sem perdas da apple; alternativa ao flac no ecossistema apple.",
    en: "apple lossless; the flac alternative in apple's ecosystem.",
    es: "audio sin pérdidas de apple; alternativa a flac en apple.",
  },
  ogg: {
    pt: "container aberto, normalmente com áudio vorbis.",
    en: "open container, usually with vorbis audio.",
    es: "contenedor abierto, normalmente con audio vorbis.",
  },
  webp: {
    pt: "imagem da web; menor que png/jpg com boa qualidade.",
    en: "web image; smaller than png/jpg at good quality.",
    es: "imagen web; más pequeña que png/jpg con buena calidad.",
  },
  tiff: {
    pt: "imagem sem perdas; impressão e arquivamento.",
    en: "lossless image; printing and archiving.",
    es: "imagen sin pérdidas; impresión y archivo.",
  },
  bmp: {
    pt: "imagem sem compressão do windows; enorme.",
    en: "uncompressed windows image; huge.",
    es: "imagen sin comprimir de windows; enorme.",
  },
  avif: {
    pt: "imagem moderna (av1); menor que webp, suporte mais recente.",
    en: "modern image (av1); smaller than webp, newer support.",
    es: "imagen moderna (av1); más pequeña que webp, soporte más nuevo.",
  },
  gif: {
    pt: "animação curta sem som; paleta limitada (256 cores).",
    en: "short silent animation; limited palette (256 colors).",
    es: "animación corta sin sonido; paleta limitada (256 colores).",
  },

  // ── gpu families ──────────────────────────────────────────
  amf: {
    pt: "gpu amd no windows. use se sua placa principal é amd (radeon).",
    en: "amd gpu on windows. use if your main card is amd (radeon).",
    es: "gpu amd en windows. úsala si tu tarjeta principal es amd (radeon).",
  },
  nvenc: {
    pt: "gpu nvidia. use se tem uma geforce/rtx dedicada.",
    en: "nvidia gpu. use if you have a dedicated geforce/rtx.",
    es: "gpu nvidia. úsala si tienes una geforce/rtx dedicada.",
  },
  qsv: {
    pt: "gráficos integrados intel (quick sync) — geralmente a iGPU.",
    en: "intel integrated graphics (quick sync) — usually the iGPU.",
    es: "gráficos integrados intel (quick sync) — normalmente la iGPU.",
  },
  vaapi: {
    pt: "aceleração no linux (amd/intel).",
    en: "acceleration on linux (amd/intel).",
    es: "aceleración en linux (amd/intel).",
  },
  video_toolbox: {
    pt: "aceleração da apple (macos).",
    en: "apple acceleration (macos).",
    es: "aceleración de apple (macos).",
  },

  // ── editing tools ─────────────────────────────────────────
  crop: {
    pt: "corta uma área retangular da imagem do vídeo (recorte no espaço).",
    en: "cuts a rectangular area of the picture (spatial crop).",
    es: "recorta un área rectangular de la imagen (recorte espacial).",
  },
  trim: {
    pt: "mantém só um trecho do tempo do vídeo (corte temporal).",
    en: "keeps only a slice of the timeline (temporal trim).",
    es: "mantiene solo un tramo del tiempo (recorte temporal).",
  },
  fps: {
    pt: "quadros por segundo do vídeo de saída.",
    en: "frames per second of the output video.",
    es: "fotogramas por segundo del vídeo de salida.",
  },
  codec: {
    pt: "codec do vídeo: h264 (compatível), h265 (menor, mais moderno), av1 (menor ainda). com gpu, usa o encoder da placa.",
    en: "video codec: h264 (compatible), h265 (smaller, modern), av1 (smallest). with gpu, uses the card's encoder.",
    es: "códec de vídeo: h264 (compatible), h265 (menor, moderno), av1 (aún menor). con gpu, usa el encoder de la tarjeta.",
  },
};

export function tip(lang: Lang, id: string): string | undefined {
  return TIPS[id]?.[lang];
}
