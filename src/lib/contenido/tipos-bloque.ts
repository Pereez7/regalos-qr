// Tipos TS del contenido versionado. Fuente de verdad del contrato:
// specs/001-pagina-regalo/contracts/regalo-contenido.schema.md

export interface Foto {
  url: string;
  alt: string;
  ancho?: number;
  alto?: number;
}

export interface BloquePortada {
  tipo: "portada";
  posicion: number;
  nombreDestinatario: string;
  subtitulo?: string;
}

export interface BloqueContador {
  tipo: "contador";
  posicion: number;
  fechaInicio: string;
}

export interface BloqueMomento {
  tipo: "momento";
  posicion: number;
  titulo?: string;
  texto: string;
  fecha?: string;
  foto?: Foto;
}

export interface BloqueGaleria {
  tipo: "galeria";
  posicion: number;
  fotos: Foto[];
}

export interface BloqueCancion {
  tipo: "cancion";
  posicion: number;
  url: string;
  titulo?: string;
  artista?: string;
}

export interface BloqueCarta {
  tipo: "carta";
  posicion: number;
  texto: string;
}

export interface BloquePregunta {
  tipo: "pregunta";
  posicion: number;
  texto: string;
  respuesta?: string;
}

export interface BloqueCierre {
  tipo: "cierre";
  posicion: number;
  texto?: string;
}

export type BloqueConocido =
  | BloquePortada
  | BloqueContador
  | BloqueMomento
  | BloqueGaleria
  | BloqueCancion
  | BloqueCarta
  | BloquePregunta
  | BloqueCierre;

// Un tipo ausente de src/bloques/registro.ts (versión futura de la app, o error de
// tipeo) se guarda igual y se omite en render — nunca rompe la validación (FR-006).
export interface BloqueDesconocido {
  tipo: string;
  posicion: number;
  [campo: string]: unknown;
}

export type Bloque = BloqueConocido | BloqueDesconocido;

export interface ContenidoV1 {
  v: 1;
  receta: Bloque[];
}

export type Contenido = ContenidoV1;
