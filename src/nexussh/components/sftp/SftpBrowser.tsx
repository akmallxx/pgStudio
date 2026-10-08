import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  File,
  FileCode,
  FileText,
  FileArchive,
  ArrowUp,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Server,
  Laptop,
  Edit2,
  Download,
  Upload,
  Plus,
  Terminal,
  Save,
  X,
  Copy,
  Layers,
  FolderOpen,
  Trash2,
  CheckCircle,
  Loader2,
  ArrowUpDown,
  ArrowDown,
} from 'lucide-react';
import { Host, SFTPFile, TransferItem } from 'nexussh/types/ssh';
import { Button } from 'nexussh/components/ui/button';
import { Dialog } from 'nexussh/components/ui/dialog';
import { Input } from 'nexussh/components/ui/input';
import { useToast } from 'nexussh/components/ui/toast';
import { cn } from 'nexussh/utils/cn';
import { api } from '../../../services/api';

interface SftpBrowserProps {
  hosts: Host[];
  selectedHostId: string;
  onSelectHost: (hostId: string) => void;
  filesByPath?: Record<string, SFTPFile[]>;
  localFilesByPath?: Record<string, SFTPFile[]>;
  fileContents?: Record<string, string>;
  onSaveFileContent?: (path: string, content: string) => void;
  onOpenTerminalAtPath?: (hostId: string, path: string) => void;
}

export function SftpBrowser({
  hosts,
  selectedHostId,
  onSelectHost,
  onOpenTerminalAtPath,
}: SftpBrowserProps) {
  const { toast } = useToast();

  const currentHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];

  // Paths
  const [localPath, setLocalPath] = useState('~');
  const [remotePath, setRemotePath] = useState('~');

  // Real Directory Listing State
  const [remoteFiles, setRemoteFiles] = useState<SFTPFile[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  const [localFiles, setLocalFiles] = useState<SFTPFile[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);

  // Selected items
  const [selectedLocalFile, setSelectedLocalFile] = useState<SFTPFile | null>(null);
  const [selectedRemoteFile, setSelectedRemoteFile] = useState<SFTPFile | null>(null);

  // File Editor Modal
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; isRemote: boolean } | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [isSavingEditor, setIsSavingEditor] = useState(false);

  // Mkdir Modal
  const [isMkdirModalOpen, setIsMkdirModalOpen] = useState(false);
  const [mkdirTargetRemote, setMkdirTargetRemote] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');

  // Delete Confirm Modal
  const [itemToDelete, setItemToDelete] = useState<{ file: SFTPFile; isRemote: boolean } | null>(null);

  // Hidden file input for uploading from local machine
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transfer Queue
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [showQueue, setShowQueue] = useState(false);

  // Sorting state for Local and Remote panes
  type SortField = 'name' | 'size' | 'modified';
  type SortOrder = 'asc' | 'desc';
  const [localSortField, setLocalSortField] = useState<SortField>('name');
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>('asc');
  const [remoteSortField, setRemoteSortField] = useState<SortField>('name');
  const [remoteSortOrder, setRemoteSortOrder] = useState<SortOrder>('asc');

  const toggleSort = (pane: 'local' | 'remote', field: SortField) => {
    if (pane === 'local') {
      if (localSortField === field) {
        setLocalSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setLocalSortField(field);
        setLocalSortOrder(field === 'modified' ? 'desc' : 'asc');
      }
    } else {
      if (remoteSortField === field) {
        setRemoteSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setRemoteSortField(field);
        setRemoteSortOrder(field === 'modified' ? 'desc' : 'asc');
      }
    }
  };

  const getSortedFiles = (files: SFTPFile[], field: SortField, order: SortOrder): SFTPFile[] => {
    const dotDot = files.filter((f) => f.name === '..');
    const dirs = files.filter((f) => f.name !== '..' && f.type === 'directory');
    const normalFiles = files.filter((f) => f.name !== '..' && f.type !== 'directory');

    const compareFn = (a: SFTPFile, b: SFTPFile) => {
      let diff = 0;
      if (field === 'name') {
        diff = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      } else if (field === 'size') {
        diff = a.sizeBytes - b.sizeBytes;
      } else if (field === 'modified') {
        diff = (a.modified || '').localeCompare(b.modified || '');
      }
      return order === 'asc' ? diff : -diff;
    };

    dirs.sort(compareFn);
    normalFiles.sort(compareFn);
    return [...dotDot, ...dirs, ...normalFiles];
  };

  // Fetch Remote Directory via real SFTP
  const fetchRemoteDir = async (path: string) => {
    if (!currentHost) return;
    setIsLoadingRemote(true);
    try {
      const res = await api.sftpList(currentHost.id, path);
      if (res && res.files) {
        setRemotePath(res.path || path);
        setRemoteFiles(res.files);
        setSelectedRemoteFile(null);
      }
    } catch (err: any) {
      toast({
        title: 'Gagal memuat SFTP remote',
        description: err.message || 'Koneksi SFTP error',
        type: 'error',
      });
    } finally {
      setIsLoadingRemote(false);
    }
  };

  // Fetch Local Directory via backend local fs
  const fetchLocalDir = async (path: string) => {
    setIsLoadingLocal(true);
    try {
      const res = await api.sftpLocalList(path);
      if (res && res.files) {
        setLocalPath(res.path || path);
        setLocalFiles(res.files);
        setSelectedLocalFile(null);
      }
    } catch (err: any) {
      toast({
        title: 'Gagal memuat folder lokal',
        description: err.message || 'Direktori lokal tidak dapat diakses',
        type: 'error',
      });
    } finally {
      setIsLoadingLocal(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (currentHost) {
      fetchRemoteDir('~');
    }
  }, [currentHost?.id]);

  useEffect(() => {
    fetchLocalDir('~');
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: SFTPFile) => {
    if (file.type === 'directory') {
      return <Folder className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'go', 'py', 'json', 'sh', 'yaml', 'yml'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
    if (['tar', 'gz', 'zip', 'rar', '7z'].includes(ext || '')) {
      return <FileArchive className="w-4 h-4 text-rose-400 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-on-surface-variant shrink-0" />;
  };

  // Navigation handlers
  const handleLocalNav = (file: SFTPFile) => {
    if (file.type === 'directory') {
      if (file.name === '..') {
        const parts = localPath.split('/').filter(Boolean);
        parts.pop();
        fetchLocalDir('/' + parts.join('/') || '/');
      } else {
        fetchLocalDir(file.path);
      }
    } else {
      openEditor(file, false);
    }
  };

  const handleRemoteNav = (file: SFTPFile) => {
    if (file.type === 'directory') {
      if (file.name === '..') {
        const parts = remotePath.split('/').filter(Boolean);
        parts.pop();
        fetchRemoteDir('/' + parts.join('/') || '/');
      } else {
        fetchRemoteDir(file.path);
      }
    } else {
      openEditor(file, true);
    }
  };

  // Transfer: Copy local file or folder directly to remote server (io.Copy stream in backend)
  const handleCopyToRemote = async (targetLocalFile?: SFTPFile) => {
    const fileToCopy = targetLocalFile || selectedLocalFile;
    if (!fileToCopy || fileToCopy.name === '..' || !currentHost) return;

    const transferId = `trans-${Date.now()}`;
    const newTransfer: TransferItem = {
      id: transferId,
      fileName: fileToCopy.name,
      direction: 'upload',
      totalBytes: fileToCopy.sizeBytes,
      transferredBytes: 0,
      progressPercent: 30,
      status: 'transferring',
      speed: 'Streaming ke remote',
    };
    setTransfers((prev) => [newTransfer, ...prev]);
    setShowQueue(true);

    try {
      await api.sftpCopyToRemote(currentHost.id, fileToCopy.path, remotePath, currentHost);

      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? { ...t, progressPercent: 100, transferredBytes: t.totalBytes, status: 'completed', speed: 'Selesai' }
            : t
        )
      );
      toast({
        title: 'Berhasil disalin ke remote',
        description: `${fileToCopy.name} disalin ke ${remotePath}`,
        type: 'success',
      });
      fetchRemoteDir(remotePath);
    } catch (err: any) {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, status: 'failed', speed: 'Gagal' } : t))
      );
      toast({ title: 'Gagal salin ke remote', description: err.message, type: 'error' });
    }
  };

  // Transfer: Copy remote file or folder directly to local computer (io.Copy stream in backend)
  const handleCopyToLocal = async (targetRemoteFile?: SFTPFile) => {
    const fileToCopy = targetRemoteFile || selectedRemoteFile;
    if (!fileToCopy || fileToCopy.name === '..' || !currentHost) return;

    const transferId = `trans-${Date.now()}`;
    const newTransfer: TransferItem = {
      id: transferId,
      fileName: fileToCopy.name,
      direction: 'download',
      totalBytes: fileToCopy.sizeBytes,
      transferredBytes: 0,
      progressPercent: 30,
      status: 'transferring',
      speed: 'Streaming ke komputer',
    };
    setTransfers((prev) => [newTransfer, ...prev]);
    setShowQueue(true);

    try {
      await api.sftpCopyToLocal(currentHost.id, fileToCopy.path, localPath, currentHost);

      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? { ...t, progressPercent: 100, transferredBytes: t.totalBytes, status: 'completed', speed: 'Selesai' }
            : t
        )
      );
      toast({
        title: 'Berhasil disalin ke komputer',
        description: `${fileToCopy.name} disalin ke folder lokal ${localPath}`,
        type: 'success',
      });
      fetchLocalDir(localPath);
    } catch (err: any) {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, status: 'failed', speed: 'Gagal' } : t))
      );
      toast({ title: 'Gagal salin ke komputer', description: err.message, type: 'error' });
    }
  };

  // Optional: Download file via browser download dialog
  const handleDownloadToBrowser = (targetFile?: SFTPFile) => {
    const file = targetFile || selectedRemoteFile;
    if (!file || file.name === '..' || file.type === 'directory' || !currentHost) return;

    const downloadUrl = api.getSftpDownloadUrl(currentHost.id, file.path);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: 'Mengunduh berkas',
      description: `${file.name} diunduh ke browser Anda`,
      type: 'info',
    });
  };

  // Upload file directly from local computer via file picker
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHost) return;

    const transferId = `trans-${Date.now()}`;
    const newTransfer: TransferItem = {
      id: transferId,
      fileName: file.name,
      direction: 'upload',
      totalBytes: file.size,
      transferredBytes: 0,
      progressPercent: 30,
      status: 'transferring',
      speed: 'Uploading...',
    };
    setTransfers((prev) => [newTransfer, ...prev]);
    setShowQueue(true);

    try {
      await api.sftpUpload(currentHost.id, remotePath, file);
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? { ...t, progressPercent: 100, transferredBytes: file.size, status: 'completed' }
            : t
        )
      );
      toast({
        title: 'Berkas berhasil diunggah',
        description: `${file.name} (${formatBytes(file.size)}) diunggah ke ${remotePath}`,
        type: 'success',
      });
      fetchRemoteDir(remotePath);
    } catch (err: any) {
      setTransfers((prev) =>
        prev.map((t) => (t.id === transferId ? { ...t, status: 'failed' } : t))
      );
      toast({ title: 'Gagal mengunggah berkas', description: err.message, type: 'error' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Open file in Editor modal
  const openEditor = async (file: SFTPFile, isRemote: boolean) => {
    if (file.type === 'directory') return;
    try {
      if (isRemote && currentHost) {
        const res = await api.sftpRead(currentHost.id, file.path);
        setEditingFile({ path: file.path, name: file.name, isRemote: true });
        setEditorContent(res.content || '');
      } else {
        const res = await api.sftpLocalRead(file.path);
        setEditingFile({ path: file.path, name: file.name, isRemote: false });
        setEditorContent(res.content || '');
      }
    } catch (err: any) {
      toast({ title: 'Gagal membuka berkas', description: err.message, type: 'error' });
    }
  };

  // Save edited file
  const handleSaveEditor = async () => {
    if (!editingFile) return;
    setIsSavingEditor(true);
    try {
      if (editingFile.isRemote && currentHost) {
        await api.sftpWrite(currentHost.id, editingFile.path, editorContent);
        toast({ title: 'Berkas remote berhasil disimpan', description: editingFile.name, type: 'success' });
        fetchRemoteDir(remotePath);
      } else {
        await api.sftpLocalWrite(editingFile.path, editorContent);
        toast({ title: 'Berkas lokal berhasil disimpan', description: editingFile.name, type: 'success' });
        fetchLocalDir(localPath);
      }
      setEditingFile(null);
    } catch (err: any) {
      toast({ title: 'Gagal menyimpan berkas', description: err.message, type: 'error' });
    } finally {
      setIsSavingEditor(false);
    }
  };

  // Mkdir handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const folder = newFolderName.trim();
    if (!folder) return;

    try {
      if (mkdirTargetRemote && currentHost) {
        const target = `${remotePath}/${folder}`.replace('//', '/');
        await api.sftpMkdir(currentHost.id, target);
        toast({ title: 'Folder remote dibuat', description: folder, type: 'success' });
        fetchRemoteDir(remotePath);
      }
      setIsMkdirModalOpen(false);
      setNewFolderName('');
    } catch (err: any) {
      toast({ title: 'Gagal membuat folder', description: err.message, type: 'error' });
    }
  };

  // Delete item handler
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const { file, isRemote } = itemToDelete;
    try {
      if (isRemote && currentHost) {
        await api.sftpDelete(currentHost.id, file.path, file.type === 'directory' ? 'directory' : 'file');
        toast({ title: 'Item remote berhasil dihapus', description: file.name, type: 'success' });
        fetchRemoteDir(remotePath);
      }
      setItemToDelete(null);
    } catch (err: any) {
      toast({ title: 'Gagal menghapus item', description: err.message, type: 'error' });
    }
  };

  // Display lists including parent folder '..'
  const baseRemoteFiles: SFTPFile[] = [
    ...(remotePath !== '/' && remotePath !== ''
      ? [
          {
            name: '..',
            path: remotePath.split('/').slice(0, -1).join('/') || '/',
            type: 'directory' as const,
            sizeBytes: 4096,
            permissions: 'drwxr-xr-x',
            owner: currentHost?.username || 'root',
            group: 'root',
            modified: '—',
          },
        ]
      : []),
    ...remoteFiles,
  ];
  const displayRemoteFiles = getSortedFiles(baseRemoteFiles, remoteSortField, remoteSortOrder);

  const baseLocalFiles: SFTPFile[] = [
    ...(localPath !== '/' && localPath !== ''
      ? [
          {
            name: '..',
            path: localPath.split('/').slice(0, -1).join('/') || '/',
            type: 'directory' as const,
            sizeBytes: 4096,
            permissions: 'drwxr-xr-x',
            owner: 'local',
            group: 'local',
            modified: '—',
          },
        ]
      : []),
    ...localFiles,
  ];
  const displayLocalFiles = getSortedFiles(baseLocalFiles, localSortField, localSortOrder);

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface overflow-hidden select-text">
      {/* Hidden File Input for uploading */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top Main Navigation Bar */}
      <div className="flex items-center justify-between border-b border-surface-container-high/80 bg-surface-container-low px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-on-surface">SFTP Dual-Pane Explorer</span>
          </div>

          <div className="h-4 w-[1px] bg-surface-container-high" />

          {/* Remote Host Picker */}
          <div className="flex items-center gap-1.5 bg-surface-container border border-surface-container-high rounded-lg px-2.5 py-1 text-xs">
            <span className="text-on-surface-variant text-[11px] font-semibold">Remote Host:</span>
            <select
              value={currentHost?.id}
              onChange={(e) => onSelectHost(e.target.value)}
              className="bg-transparent text-on-surface focus:outline-none cursor-pointer text-xs font-medium"
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id} className="bg-surface-container-low text-on-surface">
                  {h.name} ({h.hostname}:{h.port || 22})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenTerminalAtPath && currentHost && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenTerminalAtPath(currentHost.id, remotePath)}
              className="h-7.5 px-2.5 text-xs gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Buka Terminal di Path Ini</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowQueue(!showQueue)}
            className="h-7.5 px-2.5 text-xs gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-secondary" />
            <span>Transfer ({transfers.length})</span>
          </Button>
        </div>
      </div>

      {/* Side-by-side Dual Panes Area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-surface-container-high overflow-hidden">
        {/* ================= LEFT PANE: LOCAL ================= */}
        <div className="flex flex-col h-full min-h-0 bg-surface">
          {/* Local Pane Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-container-high bg-surface-container-low/70 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Laptop className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-xs font-bold text-on-surface">Komputer Lokal</span>
              {isLoadingLocal && <Loader2 className="w-3 h-3 text-secondary animate-spin" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const parts = localPath.split('/').filter(Boolean);
                  parts.pop();
                  fetchLocalDir('/' + parts.join('/') || '/');
                }}
                disabled={localPath === '/' || localPath === ''}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-30 cursor-pointer"
                title="Folder Atas (Up)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fetchLocalDir(localPath)}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
                title="Refresh Folder Lokal"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Local Path Input Bar */}
          <div className="px-3 py-1.5 bg-surface-container border-b border-surface-container-high text-xs font-mono text-on-surface-variant flex items-center justify-between shrink-0">
            <span className="truncate">{localPath}</span>
            <span className="text-[10px] text-on-surface-variant/70 shrink-0 ml-2">
              {localFiles.length} item
            </span>
          </div>

            {/* Local File Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-container-high bg-surface-container-low text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider sticky top-0 z-10 select-none">
                    <th
                      onClick={() => toggleSort('local', 'name')}
                      className="py-2 px-3 cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan nama"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nama</span>
                        {localSortField === 'name' ? (
                          localSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('local', 'size')}
                      className="py-2 px-3 text-right w-20 cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan ukuran"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Ukuran</span>
                        {localSortField === 'size' ? (
                          localSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('local', 'modified')}
                      className="py-2 px-3 w-36 hidden md:table-cell cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan tanggal modifikasi"
                    >
                      <div className="flex items-center gap-1">
                        <span>Terakhir Diubah</span>
                        {localSortField === 'modified' ? (
                          localSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th className="py-2 px-3 w-20 hidden xl:table-cell font-mono">Izin</th>
                    <th className="py-2 px-3 text-right w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/40 text-xs">
                  {displayLocalFiles.map((file) => {
                    const isSelected = selectedLocalFile?.path === file.path;
                    return (
                      <tr
                        key={file.path}
                        onClick={() => setSelectedLocalFile(file)}
                        onDoubleClick={() => handleLocalNav(file)}
                        className={cn(
                          'group transition-colors cursor-pointer select-none',
                          isSelected
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'hover:bg-surface-container/60 text-on-surface'
                        )}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {getFileIcon(file)}
                            <span className={cn('truncate', file.type === 'directory' ? 'font-semibold' : '')}>
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-on-surface-variant tabular-nums">
                          {file.type === 'directory' ? '—' : formatBytes(file.sizeBytes)}
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-on-surface-variant/70 hidden md:table-cell whitespace-nowrap tabular-nums">
                          {file.name === '..' ? '—' : (file.modified || '—')}
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-on-surface-variant/70 hidden xl:table-cell">
                          {file.permissions}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {file.name !== '..' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyToRemote(file);
                                }}
                                className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container cursor-pointer"
                                title="Salin langsung ke remote"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                            {file.type === 'file' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(file, false);
                                }}
                                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
                                title="Edit file lokal"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Local Pane Action Bar */}
            <div className="p-2.5 border-t border-surface-container-high bg-surface-container-low flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] text-on-surface-variant truncate max-w-[200px]">
                {selectedLocalFile && selectedLocalFile.name !== '..' ? selectedLocalFile.name : 'Pilih file/folder untuk disalin ke remote'}
              </span>
              <Button
                size="sm"
                variant="default"
                disabled={!selectedLocalFile || selectedLocalFile.name === '..'}
                onClick={() => handleCopyToRemote()}
                className="h-7.5 px-3 text-xs gap-1.5 font-semibold"
              >
                <span>Salin ke Remote</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
        </div>

        {/* ================= RIGHT PANE: REMOTE (REAL SFTP) ================= */}
        <div className="flex flex-col h-full min-h-0 bg-surface">
          {/* Remote Pane Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-container-high bg-surface-container-low/70 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Server className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-bold text-on-surface truncate">
                Remote: {currentHost.username}@{currentHost.hostname}:{currentHost.port || 22}
              </span>
              {isLoadingRemote && <Loader2 className="w-3 h-3 text-primary animate-spin" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setMkdirTargetRemote(true);
                  setIsMkdirModalOpen(true);
                }}
                className="p-1 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container cursor-pointer"
                title="Buat Folder Baru di Remote"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded-lg text-on-surface-variant hover:text-emerald-400 hover:bg-surface-container cursor-pointer"
                title="Unggah Berkas dari Komputer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const parts = remotePath.split('/').filter(Boolean);
                  parts.pop();
                  fetchRemoteDir('/' + parts.join('/') || '/');
                }}
                disabled={remotePath === '/' || remotePath === ''}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-30 cursor-pointer"
                title="Folder Atas (Up)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fetchRemoteDir(remotePath)}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
                title="Refresh Folder Remote"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Remote Path Bar */}
          <div className="px-3 py-1.5 bg-surface-container border-b border-surface-container-high text-xs font-mono text-on-surface-variant flex items-center justify-between shrink-0">
            <span className="truncate">{remotePath}</span>
            <span className="text-[10px] text-on-surface-variant/70 shrink-0 ml-2">
              {remoteFiles.length} item
            </span>
          </div>

            {/* Remote File Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-container-high bg-surface-container-low text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider sticky top-0 z-10 select-none">
                    <th
                      onClick={() => toggleSort('remote', 'name')}
                      className="py-2 px-3 cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan nama"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nama</span>
                        {remoteSortField === 'name' ? (
                          remoteSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('remote', 'size')}
                      className="py-2 px-3 text-right w-20 cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan ukuran"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Ukuran</span>
                        {remoteSortField === 'size' ? (
                          remoteSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('remote', 'modified')}
                      className="py-2 px-3 w-36 hidden md:table-cell cursor-pointer hover:text-on-surface hover:bg-surface-container transition-colors group"
                      title="Urutkan berdasarkan tanggal modifikasi"
                    >
                      <div className="flex items-center gap-1">
                        <span>Terakhir Diubah</span>
                        {remoteSortField === 'modified' ? (
                          remoteSortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />
                        )}
                      </div>
                    </th>
                    <th className="py-2 px-3 w-20 hidden xl:table-cell font-mono">Izin</th>
                    <th className="py-2 px-3 text-right w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-high/40 text-xs">
                  {displayRemoteFiles.map((file) => {
                    const isSelected = selectedRemoteFile?.path === file.path;
                    return (
                      <tr
                        key={file.path}
                        onClick={() => setSelectedRemoteFile(file)}
                        onDoubleClick={() => handleRemoteNav(file)}
                        className={cn(
                          'group transition-colors cursor-pointer select-none',
                          isSelected
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'hover:bg-surface-container/60 text-on-surface'
                        )}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {getFileIcon(file)}
                            <span className={cn('truncate', file.type === 'directory' ? 'font-semibold' : '')}>
                              {file.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-on-surface-variant tabular-nums">
                          {file.type === 'directory' ? '—' : formatBytes(file.sizeBytes)}
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-on-surface-variant/70 hidden md:table-cell whitespace-nowrap tabular-nums">
                          {file.name === '..' ? '—' : (file.modified || '—')}
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-on-surface-variant/70 hidden xl:table-cell">
                          {file.permissions}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {file.name !== '..' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyToLocal(file);
                                }}
                                className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container cursor-pointer"
                                title="Salin langsung ke folder komputer"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            {file.type === 'file' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditor(file, true);
                                  }}
                                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
                                  title="Edit berkas"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadToBrowser(file);
                                  }}
                                  className="p-1 rounded text-on-surface-variant hover:text-emerald-400 hover:bg-surface-container cursor-pointer"
                                  title="Unduh ke browser"
                                >
                                  <Download className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {file.name !== '..' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemToDelete({ file, isRemote: true });
                                }}
                                className="p-1 rounded text-on-surface-variant hover:text-rose-400 hover:bg-surface-container cursor-pointer"
                                title="Hapus item"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Remote Pane Action Bar */}
            <div className="p-2.5 border-t border-surface-container-high bg-surface-container-low flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] text-on-surface-variant truncate max-w-[200px]">
                {selectedRemoteFile && selectedRemoteFile.name !== '..' ? selectedRemoteFile.name : 'Pilih file/folder untuk disalin ke komputer'}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="default"
                  disabled={!selectedRemoteFile || selectedRemoteFile.name === '..'}
                  onClick={() => handleCopyToLocal()}
                  className="h-7.5 px-3 text-xs gap-1.5 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Salin ke Komputer</span>
                </Button>
                {selectedRemoteFile && selectedRemoteFile.type === 'file' && (
                  <button
                    onClick={() => handleDownloadToBrowser()}
                    className="p-1.5 rounded-lg border border-surface-container-high hover:bg-surface-container text-on-surface-variant hover:text-emerald-400 transition-colors cursor-pointer"
                    title="Unduh berkas ke browser"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
        </div>
      </div>

      {/* Transfer Queue Drawer */}
      {showQueue && (
        <div className="border-t border-surface-container-high bg-surface-container-low p-3 px-4 shadow-xl shrink-0 max-h-36 overflow-y-auto animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-high/60">
            <span className="text-xs font-bold text-on-surface">Antrean Transfer ({transfers.length})</span>
            <button onClick={() => setShowQueue(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 mt-2">
            {transfers.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant text-center py-2">Belum ada transfer yang berjalan.</p>
            ) : (
              transfers.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-container border border-surface-container-high/60">
                  <div className="flex items-center gap-2 truncate">
                    {item.direction === 'upload' ? (
                      <Upload className="w-3.5 h-3.5 text-secondary shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="text-on-surface font-medium truncate">{item.fileName}</span>
                    <span className="text-[10px] text-on-surface-variant">({formatBytes(item.totalBytes)})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono">
                    <span className="text-[10px] text-primary font-bold tabular-nums">{item.progressPercent}%</span>
                    <span className="text-[10px] text-on-surface-variant">{item.speed}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Built-in File Editor Modal */}
      <Dialog
        open={editingFile !== null}
        onOpenChange={(open) => {
          if (!open) setEditingFile(null);
        }}
        title={`Edit ${editingFile?.name || ''}`}
        description={editingFile?.path || ''}
        maxWidth="2xl"
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-3 text-xs">
            <textarea
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full bg-transparent text-on-surface focus:outline-none resize-none font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-surface-container-high">
            <span className="text-[11px] font-mono text-on-surface-variant">
              {editorContent.split('\n').length} baris | {editorContent.length} bytes
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingFile(null)}>
                Batal
              </Button>
              <Button size="sm" onClick={handleSaveEditor} disabled={isSavingEditor} className="gap-1.5">
                {isSavingEditor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Simpan File</span>
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Mkdir Modal */}
      <Dialog
        open={isMkdirModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsMkdirModalOpen(false);
            setNewFolderName('');
          }
        }}
        title="Buat Folder Baru"
        description={`Lokasi: ${mkdirTargetRemote ? remotePath : localPath}`}
        maxWidth="sm"
      >
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <div>
            <label className="text-xs text-on-surface-variant font-medium block mb-1">
              Nama Folder:
            </label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Contoh: my_new_folder"
              autoFocus
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsMkdirModalOpen(false)}>
              Batal
            </Button>
            <Button size="sm" type="submit" disabled={!newFolderName.trim()}>
              Buat Folder
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Item Confirmation Modal */}
      <Dialog
        open={itemToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
        title="Konfirmasi Hapus"
        description={`Apakah Anda yakin ingin menghapus "${itemToDelete?.file.name}"? Tindakan ini tidak dapat dibatalkan.`}
        maxWidth="sm"
      >
        <div className="flex items-center justify-end gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => setItemToDelete(null)}>
            Batal
          </Button>
          <Button variant="destructive" size="sm" onClick={handleConfirmDelete}>
            Hapus Permanen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
