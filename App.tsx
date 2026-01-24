import React, { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { UploadedDocument, DocStatus, Message } from './types';
import { ingestDocument, retrieveDocuments } from './services/rag';
import { generateRAGResponse } from './services/gemini';
import { extractTextFromPDF } from './services/pdfLoader';
import { Send, Menu, X } from 'lucide-react';

export default function App() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Document Upload Handler ---
  const handleUpload = useCallback(async (files: FileList) => {
    if (!process.env.API_KEY) {
      alert("Missing API_KEY in environment variables.");
      return;
    }

    const newDocs: UploadedDocument[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      content: '', // Will be filled
      status: DocStatus.UPLOADING,
      chunkCount: 0,
      uploadedAt: new Date(),
    }));

    setDocuments(prev => [...prev, ...newDocs]);
    // Automatically select new documents
    setSelectedDocIds(prev => [...prev, ...newDocs.map(d => d.id)]);

    // Process each file
    for (const [index, file] of Array.from(files).entries()) {
      const docId = newDocs[index].id;
      
      try {
        let text = '';
        
        // Handle PDF vs Text files
        // improved check: looks at MIME type OR extension
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          text = await extractTextFromPDF(file);
        } else {
          text = await file.text(); // Native FileReader API for txt, md, json
        }
        
        // Update content status
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, content: text, status: DocStatus.PROCESSING } : d));

        // Start Ingestion (Splitting & Embedding)
        await ingestDocument(
          { ...newDocs[index], content: text }, 
          (progress) => {
             // Optional: Handle precise progress bars here if needed
             if (progress < 1) {
                setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: DocStatus.EMBEDDING } : d));
             }
          }
        );

        // Finalize
        setDocuments(prev => prev.map(d => d.id === docId ? { 
          ...d, 
          status: DocStatus.INDEXED,
          // Rough estimate of chunk count based on logic
          chunkCount: Math.ceil(text.length / 650) 
        } : d));

      } catch (error) {
        console.error("Error processing file", error);
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: DocStatus.ERROR } : d));
      }
    }
  }, []);

  // --- Selection Handlers ---
  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedDocIds.length === documents.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(documents.map(d => d.id));
    }
  };

  // --- Chat Handler ---
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;

    if (selectedDocIds.length === 0) {
      alert("Please select at least one document to search!");
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    // Add placeholder "Thinking" message
    const thinkingMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: thinkingMsgId,
      role: 'model',
      content: '',
      timestamp: new Date(),
      isThinking: true
    }]);

    try {
      // 1. Retrieval (Filtered by selectedDocIds)
      const retrievedChunks = await retrieveDocuments(userMsg.content, selectedDocIds, 5);

      // 2. Generation
      const response = await generateRAGResponse(userMsg.content, retrievedChunks);

      // 3. Update Message
      setMessages(prev => prev.map(msg => {
        if (msg.id === thinkingMsgId) {
          return {
            ...msg,
            content: response.text,
            isThinking: false,
            sources: retrievedChunks
          };
        }
        return msg;
      }));

    } catch (error) {
      console.error("Chat error", error);
      setMessages(prev => prev.map(msg => {
        if (msg.id === thinkingMsgId) {
          return {
            ...msg,
            content: "I apologize, but I encountered an error processing your request.",
            isThinking: false
          };
        }
        return msg;
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden relative">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar 
          documents={documents} 
          onUpload={handleUpload}
          selectedDocIds={selectedDocIds}
          onToggleDoc={toggleDoc}
          onToggleAll={toggleAll}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full w-full">
        {/* Header */}
        <header className="h-16 bg-slate-900/50 backdrop-blur border-b border-slate-800 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
             <button 
               className="md:hidden text-slate-400 hover:text-white"
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
             >
               {isSidebarOpen ? <X /> : <Menu />}
             </button>
             <h2 className="text-sm font-medium text-slate-300">
               {selectedDocIds.length > 0 ? `${selectedDocIds.length} Document(s) Active` : 'No Documents Selected'}
             </h2>
          </div>
          <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             <span className="text-xs font-medium text-emerald-500">System Ready</span>
          </div>
        </header>

        {/* Messages */}
        <MessageList messages={messages} />

        {/* Input Area */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <form 
            onSubmit={handleSend}
            className="max-w-4xl mx-auto relative flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your documents..."
              className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder-slate-500"
              disabled={isProcessing}
            />
            <button
              type="submit"
              disabled={!input.trim() || isProcessing || selectedDocIds.length === 0}
              className="absolute right-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-2">
             <p className="text-[10px] text-slate-600">
               {selectedDocIds.length === 0 
                 ? "Please select documents from the sidebar to start." 
                 : "AI can make mistakes. Verify important information from the source cards."}
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}