export interface Folder {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface FolderCreateInput {
  name: string;
  color?: string;
}
