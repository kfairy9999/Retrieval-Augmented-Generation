import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types';
import { Bot, User, BrainCircuit } from 'lucide-react';
import { SourceCard } from './SourceCard';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
          <BrainCircuit className="w-16 h-16 mb-4 text-indigo-500" />
          <p className="text-lg font-medium">Ready to query your knowledge base</p>
        </div>
      )}
      
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'model' && (
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg shadow-indigo-900/50">
              <Bot className="w-5 h-5 text-white" />
            </div>
          )}

          <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'order-1' : 'order-2'}`}>
            <div 
              className={`p-4 rounded-2xl shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-slate-700 text-white rounded-br-none' 
                  : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
              }`}
            >
              {msg.isThinking ? (
                 <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
                    <BrainCircuit className="w-4 h-4" />
                    <span>Analyzing documents...</span>
                 </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
            
            {!msg.isThinking && msg.role === 'model' && msg.sources && (
              <div className="mt-2 animate-fadeIn">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold ml-1">References used</span>
                <SourceCard sources={msg.sources} />
              </div>
            )}
            
            <span className={`text-[10px] text-slate-500 mt-1 block ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {msg.role === 'user' && (
             <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 mt-1">
              <User className="w-5 h-5 text-slate-200" />
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
