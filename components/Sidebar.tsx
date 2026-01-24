import React, { useRef } from 'react';
import { UploadedDocument, DocStatus } from '../types';
import { FileUp, FileText, CheckCircle, Loader2, AlertCircle, Database, CheckSquare, Square } from 'lucide-react';

interface SidebarProps {
  documents: UploadedDocument[];
  onUpload: (files: FileList) => void;
  selectedDocIds: string[];
  onToggleDoc: (id: string) => void;
  onToggleAll: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ documents, onUpload, selectedDocIds, onToggleDoc, onToggleAll }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getStatusIcon = (status: DocStatus) => {
    switch (status) {
      case DocStatus.INDEXED: return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case DocStatus.PROCESSING:
      case DocStatus.EMBEDDING: return <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />;
      case DocStatus.ERROR: return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <div className="w-4 h-4 rounded-full border-2 border-slate-600" />;
    }
  };

  const allSelected = documents.length > 0 && selectedDocIds.length === documents.length;

  return (
    <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col h-full flex-shrink-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-500" />
          RAG Engine
        </h1>
        <p className="text-xs text-slate-400 mt-1">Personal Knowledge Base</p>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Actions
          </h2>
          
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            multiple 
            accept=".txt,.md,.json,.pdf" 
            onChange={handleFileChange}
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg transition-all text-sm font-medium shadow-lg shadow-indigo-900/20 mb-2"
          >
            <FileUp className="w-4 h-4" />
            Upload Documents
          </button>
          
          {documents.length > 0 && (
             <button
               onClick={onToggleAll}
               className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-all text-xs font-medium"
             >
               {allSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
               {allSelected ? 'Deselect All' : 'Select All'}
             </button>
          )}
        </div>

        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Uploaded Documents ({selectedDocIds.length}/{documents.length})
          </h2>
          
          <div className="space-y-2">
            {documents.length === 0 && (
              <div className="text-center py-8 px-4 border-2 border-dashed border-slate-800 rounded-lg">
                <p className="text-sm text-slate-500">No documents indexed.</p>
              </div>
            )}

            {documents.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
              return (
                <div 
                  key={doc.id} 
                  className={`group relative bg-slate-800/50 border rounded-lg p-3 transition-all ${isSelected ? 'border-indigo-500/30 bg-indigo-900/10' : 'border-transparent hover:border-slate-700'}`}
                >
                  <div className="flex items-start gap-3">
                    <button 
                      onClick={() => onToggleDoc(doc.id)}
                      className="mt-1 text-slate-400 hover:text-indigo-400 transition-colors focus:outline-none"
                    >
                      {isSelected 
                        ? <CheckSquare className="w-4 h-4 text-indigo-500" /> 
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                    
                    <div className="flex-1 min-w-0" onClick={() => onToggleDoc(doc.id)}>
                      <div className="flex justify-between items-start">
                        <p className={`text-sm font-medium truncate cursor-pointer ${isSelected ? 'text-indigo-200' : 'text-slate-300'}`} title={doc.name}>
                          {doc.name}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        {getStatusIcon(doc.status)}
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">
                          {doc.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {doc.status === DocStatus.INDEXED && (
                    <div className="mt-2 pt-2 border-t border-slate-800/50 flex justify-between text-[10px] text-slate-500 ml-7">
                      <span>{(doc.size / 1024).toFixed(1)} KB</span>
                      <span>{doc.chunkCount} Chunks</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-600">
        <p>Running Gemini 1.5 Pro (via Gemini 3 Preview)</p>
        <p>Client-side Vector Store</p>
      </div>
    </div>
  );
};