export interface WikiPage {
  path: string;
  name: string;
  type: 'source' | 'entity' | 'concept' | 'synthesis' | 'root';
  content?: string;
  modifiedAt: number;
}

export interface SourceFile {
  name: string;
  size: number;
  modifiedAt: number;
}

export interface IngestRequest {
  filename: string;
  model?: string;
}

export interface QueryRequest {
  question: string;
  model?: string;
}
