import React from 'react';
import { SearchResult } from '../types';
import { FileText, Quote } from 'lucide-react';

interface SourceCardProps {
  sources: SearchResult[];
}

export const SourceCard: React.FC<SourceCardProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2">
      {sources.map((source) => (
        <div 
          key={source.id} 
          className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 hover:border-indigo-500/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
            <FileText className="w-3 h-3 text-indigo-400" />
            <span className="font-semibold truncate text-indigo-200">{source.metadata.source}</span>
            <span className="ml-auto text-slate-500">{(source.score * 100).toFixed(0)}% Match</span>
          </div>
          <div className="relative pl-3">
             <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-700 rounded-full"></div>
             <p className="line-clamp-3 italic text-slate-400">
               "{source.content}"
             </p>
          </div>
        </div>
      ))}
    </div>
  );
};
