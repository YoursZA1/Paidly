import React, { useState, useEffect } from 'react';
import { Note } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, ArrowLeft, Search, Trash2, Bookmark, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import NotesList from '../components/notes/NotesList';
import NoteEditor from '../components/notes/NoteEditor';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function Notes() {
    const [notes, setNotes] = useState([]);
    const [selectedNote, setSelectedNote] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [pinnedNotes, setPinnedNotes] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

    useEffect(() => {
        loadNotes();
    }, []);

    const loadNotes = async () => {
        setIsLoading(true);
        try {
            const notesData = await Note.list('-updated_date');
            setNotes(notesData);
            const pinned = notesData.filter(n => n.is_pinned);
            setPinnedNotes(pinned);
        } catch (error) {
            console.error("Error loading notes:", error);
        }
        setIsLoading(false);
    };

    const handleNewNote = async () => {
        const newNote = await Note.create({
            title: "New Note",
            content: ""
        });
        await loadNotes();
        setSelectedNote(newNote);
    };

    const handleSelectNote = (note) => {
        setSelectedNote(note);
    };
    
    const handleSaveNote = async (noteToSave) => {
        if (!noteToSave.id) return;
        await Note.update(noteToSave.id, { 
            title: noteToSave.title, 
            content: noteToSave.content,
            is_pinned: noteToSave.is_pinned
        });
        await loadNotes();
    };

    const handleDeleteNote = async (noteId) => {
        await Note.delete(noteId);
        await loadNotes();
        setSelectedNote(null);
    };

    const handlePinNote = async (note) => {
        await Note.update(note.id, { is_pinned: !note.is_pinned });
        await loadNotes();
    };

    const filteredNotes = notes.filter(note => 
        note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pinnedFilteredNotes = filteredNotes.filter(n => n.is_pinned);
    const unpinnedFilteredNotes = filteredNotes.filter(n => !n.is_pinned);

    return (
        <div className="flex h-full bg-gradient-to-br from-gray-50 to-gray-100 overflow-hidden">
            {/* Sidebar - Notes List */}
            <motion.div 
                initial={{ x: -350 }}
                animate={{ x: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`w-full sm:w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm ${
                    selectedNote ? 'hidden sm:flex' : 'flex'
                }`}
            >
                {/* Header */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="p-6 border-b border-gray-200"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-3xl font-bold text-gray-900">Notes</h1>
                        <motion.div
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={handleNewNote}
                                className="hover:bg-gray-200 rounded-full"
                            >
                                <Plus className="w-6 h-6 text-gray-900" />
                            </Button>
                        </motion.div>
                    </div>
                    
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-gray-100 border-0 rounded-full focus:bg-white transition-colors"
                        />
                    </div>
                </motion.div>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto">
                    <AnimatePresence>
                        {/* Pinned Notes Section */}
                        {pinnedFilteredNotes.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <div className="px-4 pt-4 pb-2">
                                    <p className="text-xs font-semibold text-gray-500 uppercase">Pinned</p>
                                </div>
                                {pinnedFilteredNotes.map((note, idx) => (
                                    <motion.div
                                        key={note.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <NoteItem 
                                            note={note} 
                                            isSelected={selectedNote?.id === note.id}
                                            onSelect={handleSelectNote}
                                            onPin={handlePinNote}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}

                        {/* Unpinned Notes Section */}
                        {unpinnedFilteredNotes.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {pinnedFilteredNotes.length > 0 && (
                                    <div className="px-4 pt-4 pb-2">
                                        <p className="text-xs font-semibold text-gray-500 uppercase">Notes</p>
                                    </div>
                                )}
                                {unpinnedFilteredNotes.map((note, idx) => (
                                    <motion.div
                                        key={note.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: (pinnedFilteredNotes.length + idx) * 0.05 }}
                                    >
                                        <NoteItem 
                                            note={note} 
                                            isSelected={selectedNote?.id === note.id}
                                            onSelect={handleSelectNote}
                                            onPin={handlePinNote}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}

                        {/* Empty State */}
                        {filteredNotes.length === 0 && !isLoading && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="p-6 text-center"
                            >
                                <p className="text-gray-500 text-sm">
                                    {searchQuery ? 'No notes found' : 'No notes yet. Tap + to create one.'}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Stats */}
                <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
                    <p>{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
                </div>
            </motion.div>

            {/* Main Editor Area */}
            <AnimatePresence mode="wait">
                {selectedNote ? (
                    <motion.div 
                        key={selectedNote.id}
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 100 }}
                        transition={{ duration: 0.2 }}
                        className="w-full sm:w-2/3 lg:w-3/4 flex flex-col bg-white"
                    >
                        {/* Editor Header */}
                        <div className="h-20 border-b border-gray-200 flex items-center justify-between px-6 sm:px-8">
                            <div className="flex items-center gap-4 flex-1 sm:hidden">
                                <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => setSelectedNote(null)}
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                                <p className="text-sm text-gray-500">
                                    {format(new Date(selectedNote.updated_date || selectedNote.created_date), 'MMM d, h:mm a')}
                                </p>
                            </div>

                            <p className="hidden sm:block text-sm text-gray-500 ml-auto">
                                {format(new Date(selectedNote.updated_date || selectedNote.created_date), 'MMM d, h:mm a')}
                            </p>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="w-5 h-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handlePinNote(selectedNote)}>
                                        {selectedNote.is_pinned ? (
                                            <>
                                                <Bookmark className="w-4 h-4 mr-2 fill-current" />
                                                Unpin
                                            </>
                                        ) : (
                                            <>
                                                <Bookmark className="w-4 h-4 mr-2" />
                                                Pin
                                            </>
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                        onClick={() => handleDeleteNote(selectedNote.id)}
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Editor */}
                        <div className="flex-1 overflow-hidden">
                            <NoteEditor 
                                note={selectedNote}
                                onSave={handleSaveNote}
                                onDelete={handleDeleteNote}
                                key={selectedNote.id}
                            />
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hidden sm:flex w-2/3 lg:w-3/4 flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100"
                    >
                        <motion.div
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </div>
                        </motion.div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Note</h2>
                        <p className="text-gray-600 text-center max-w-xs mb-6">
                            Choose a note from the list or create a new one to get started
                        </p>
                        <Button onClick={handleNewNote} className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Note
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Note Item Component
const NoteItem = ({ note, isSelected, onSelect, onPin }) => {
    const preview = note.content?.substring(0, 100).replace(/<[^>]*>/g, '') || 'No additional text';
    
    return (
        <motion.button
            onClick={() => onSelect(note)}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                isSelected 
                    ? 'bg-blue-50 border-l-4 border-l-blue-600' 
                    : 'hover:bg-gray-50'
            }`}
            whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}
            whileTap={{ scale: 0.98 }}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                        {note.title || 'Untitled'}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-1">
                        {preview}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(note.updated_date || note.created_date), 'MMM d')}
                    </p>
                </div>
                {note.is_pinned && (
                    <Pin className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
            </div>
        </motion.button>
    );
}