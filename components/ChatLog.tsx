'use client';

import { useEffect, useRef } from 'react';

interface Message {
  agentId: string;
  agentName: string;
  content: string;
  turn: number;
  color: string;
}

interface ChatLogProps {
  messages: Message[];
}

export default function ChatLog({ messages }: ChatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-gray-900 p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="text-gray-500 text-center py-8">Waiting for agents…</div>
      ) : (
        messages.map((message, index) => (
          <div
            key={index}
            className="bg-gray-800 rounded-lg p-4 border-l-4 transition-all hover:bg-gray-750"
            style={{ borderLeftColor: message.color }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: message.color }} />
                <span className="font-semibold text-white">{message.agentName}</span>
              </div>
              <span className="text-xs text-gray-500">Turn {message.turn}</span>
            </div>
            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        ))
      )}
    </div>
  );
}
