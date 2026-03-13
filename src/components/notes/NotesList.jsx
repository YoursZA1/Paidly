import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function NotesList({ notes, selectedNote, onSelectNote, isLoading }) {
    if (isLoading) {
        return (
            <div className="p-2 space-y-2">
                {Array(5).fill(0).map((_, i) => (
                    <div key={i} className="p-2">
                        <Skeleton className="h-5 w-3/4 mb-1" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                ))}
            </div>
        );
    }
    
    return (
        <div>
            {notes.map(note => (
                <div
                    key={note.id}
                    onClick={() => onSelectNote(note)}
                    className={`p-4 cursor-pointer border-l-4 ${
                        selectedNote?.id === note.id
                            ? 'bg-yellow-100 dark:bg-amber-950/50 border-yellow-400 dark:border-amber-600'
                            : 'border-transparent hover:bg-gray-100 dark:hover:bg-slate-700/50'
                    }`}
                >
                    <h3 className="font-semibold truncate text-slate-900 dark:text-slate-100">{note.title || "Untitled"}</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2">{note.content ? note.content.replace(/<[^>]+>/g, '').substring(0, 100) : "No additional text"}</p>
                </div>
            ))}
        </div>
    );
}