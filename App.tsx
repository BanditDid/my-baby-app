
import React, { useState, useEffect } from 'react';
import { Plus, Settings, UploadCloud, Sparkles, Image as ImageIcon, X, Search, LayoutGrid, LayoutList, XCircle, LogIn, CheckCircle, Loader2, HelpCircle } from 'lucide-react';
import { Button } from './components/Button';
import { MemoryCard } from './components/MemoryCard';
import { MemoryListItem } from './components/MemoryListItem';
import { SettingsModal } from './components/SettingsModal';
import { GoogleSetupModal } from './components/GoogleSetupModal';
import { ChildProfile, Memory, Mood, MemoryImage } from './types';
import { calculateAge, formatDate } from './utils/dateUtils';
import { analyzeImage } from './services/geminiService';
import { MOOD_CONFIG } from './constants';
import { compressImage } from './utils/imageUtils';
import { saveMemoryToDB, deleteMemoryFromDB, getAllMemoriesFromDB, migrateFromLocalStorage } from './services/storageService';
import { loadGoogleApi, handleGoogleLogin, uploadImageToDrive, appendToSheet, getGapiClient, isGoogleConfigured } from './services/googleCloudService';

// Helper to safely extract error message
const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
      // Try to extract message from common Google API error structures
      if (error.result && error.result.error && error.result.error.message) {
          return error.result.error.message;
      }
      if (error.message) return error.message;
      try {
        return JSON.stringify(error);
      } catch (e) {
        return "Unknown error (object)";
      }
  }
  return "Unknown error occurred";
};

const App: React.FC = () => {
  // State
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Google Auth State
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  
  // View & Filter State
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [searchText, setSearchText] = useState('');
  const [filterMood, setFilterMood] = useState<Mood | 'ALL'>('ALL');

  // Form State
  const [selectedFiles, setSelectedFiles] = useState<MemoryImage[]>([]);
  const [photoDate, setPhotoDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<Mood>(Mood.NEUTRAL);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load data on mount
  useEffect(() => {
    const initData = async () => {
        try {
            // 1. Load Profile
            const savedProfile = localStorage.getItem('baby_profile');
            if (savedProfile) {
                setProfile(JSON.parse(savedProfile));
            } else {
                setIsSettingsOpen(true);
            }

            // 2. Migrate Memories if needed
            await migrateFromLocalStorage();

            // 3. Load Memories from IndexedDB
            const dbMemories = await getAllMemoriesFromDB();
            setMemories(dbMemories);
        } catch (error) {
            console.error("Failed to load data:", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    initData();

    // Load Google API
    loadGoogleApi(() => {
        setIsGoogleReady(true);
        // Check if already signed in (simplified check)
        const gapi = getGapiClient();
        if (gapi && gapi.client && gapi.client.getToken()) {
            setIsGoogleSignedIn(true);
        }
    });
  }, []);

  const handleGoogleSignIn = async () => {
      if (!isGoogleConfigured()) {
          setIsSetupOpen(true);
          return;
      }

      try {
          await handleGoogleLogin();
          setIsGoogleSignedIn(true);
          alert("Connected to Google!");
      } catch (error: any) {
          console.error("Login failed", error);
          alert(`Failed to connect to Google: ${getErrorMessage(error)}`);
      }
  };

  const handleSaveProfile = (newProfile: ChildProfile) => {
    setProfile(newProfile);
    localStorage.setItem('baby_profile', JSON.stringify(newProfile));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages: MemoryImage[] = [];
      const files: File[] = Array.from(e.target.files);

      setIsAnalyzing(true); 
      
      for (const file of files) {
        try {
            const { base64, mimeType } = await compressImage(file);
            newImages.push({
                id: crypto.randomUUID(),
                base64,
                mimeType
            });
        } catch (err) {
            console.error("Error processing image:", err);
        }
      }

      setIsAnalyzing(false);
      setSelectedFiles(prev => [...prev, ...newImages]);
      
      if (newImages.length > 0 && !note && process.env.API_KEY) {
        analyzeWithGemini(newImages[0]);
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const analyzeWithGemini = async (image: MemoryImage) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeImage(image.base64.split(',')[1], image.mimeType);
      if (result) {
        setSelectedMood(result.mood);
        setNote(result.suggestedNote);
      }
    } catch (e) {
      console.error("AI Analysis failed", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setSelectedFiles([]);
    setNote('');
    setSelectedMood(Mood.NEUTRAL);
    setPhotoDate(new Date().toISOString().split('T')[0]);
  };

  const openAddModal = () => {
    if (!profile) {
      setIsSettingsOpen(true);
      return;
    }
    setEditingId(null);
    setSelectedFiles([]);
    setNote('');
    setSelectedMood(Mood.NEUTRAL);
    setPhotoDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const openEditModal = (memory: Memory) => {
    setEditingId(memory.id);
    setPhotoDate(memory.date);
    setNote(memory.note);
    setSelectedMood(memory.mood);
    setSelectedFiles([...memory.images]); 
    setIsModalOpen(true);
  };

  const handleSaveMemory = async () => {
    if (!profile || selectedFiles.length === 0) return;
    
    setIsSaving(true);

    try {
        const age = calculateAge(profile.birthday, photoDate);
        let updatedMemory: Memory;

        const memoryData = {
            id: editingId || crypto.randomUUID(),
            date: photoDate,
            images: selectedFiles,
            note,
            mood: selectedMood,
            calculatedAge: age,
            createdAt: Date.now()
        };

        // 1. Save to Local IndexedDB (Backup/Offline view)
        if (editingId) {
            updatedMemory = { ...memories.find(m => m.id === editingId)!, ...memoryData };
            await saveMemoryToDB(updatedMemory);
            setMemories(prev => prev.map(m => m.id === editingId ? updatedMemory : m));
        } else {
            updatedMemory = memoryData;
            await saveMemoryToDB(updatedMemory);
            setMemories(prev => [updatedMemory, ...prev]);
        }

        // 2. Upload to Google Drive & Sheet (If Signed In)
        if (isGoogleSignedIn) {
            try {
                if (!isGoogleConfigured()) {
                    throw new Error("Google Cloud not configured properly. Check your keys.");
                }
                
                const imageUrls: string[] = [];
                // Upload images
                for (let i = 0; i < selectedFiles.length; i++) {
                    const img = selectedFiles[i];
                    const fileName = `BabySteps_${photoDate}_${i+1}.jpg`;
                    const url = await uploadImageToDrive(img.base64, img.mimeType, fileName);
                    imageUrls.push(url);
                }
                
                // Append to Sheet
                await appendToSheet(updatedMemory, imageUrls);
                console.log("Synced to Google Cloud successfully");
            } catch (googleErr: any) {
                console.error("Failed to sync to Google:", googleErr);
                alert(`Saved locally, but failed to upload to Google. Error: ${getErrorMessage(googleErr)}`);
            }
        }

        closeModal();

    } catch (error: any) {
        console.error("Failed to save memory:", error);
        alert(`Failed to save memory: ${getErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (confirm("Are you sure you want to delete this memory?")) {
      try {
          await deleteMemoryFromDB(id);
          setMemories(prev => prev.filter(m => m.id !== id));
      } catch (error) {
          console.error("Failed to delete:", error);
          alert(`Failed to delete: ${getErrorMessage(error)}`);
      }
    }
  };

  // --- Filter Logic ---
  const filteredMemories = memories.filter(memory => {
    const matchesMood = filterMood === 'ALL' || memory.mood === filterMood;
    const searchLower = searchText.toLowerCase();
    
    const matchesSearch = 
        memory.note.toLowerCase().includes(searchLower) || 
        memory.calculatedAge.toLowerCase().includes(searchLower) ||
        formatDate(memory.date).toLowerCase().includes(searchLower);
    
    return matchesMood && matchesSearch;
  });

  if (isLoadingData) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 text-rose-500">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
                  <p className="font-medium">Loading Memories...</p>
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white sticky top-0 z-30 border-b border-slate-100 shadow-sm px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-rose-500">BabySteps</h1>
          {profile && (
            <p className="text-xs text-slate-500">
              {profile.name} • {calculateAge(profile.birthday, new Date().toISOString())} old
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
           <button
              onClick={() => setIsSetupOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              title="Google Setup Help"
            >
              <HelpCircle size={20} />
           </button>

           <button 
             onClick={handleGoogleSignIn}
             className={`p-2 rounded-full transition-colors flex items-center gap-1 ${
                 !isGoogleReady 
                 ? 'bg-slate-100 text-slate-400 cursor-wait opacity-50' 
                 : isGoogleSignedIn 
                     ? 'bg-green-50 text-green-600' 
                     : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
             }`}
             title={isGoogleSignedIn ? "Connected to Google" : "Connect Google Drive"}
           >
             {!isGoogleReady ? <Loader2 size={20} className="animate-spin" /> : (isGoogleSignedIn ? <CheckCircle size={20} /> : <LogIn size={20} />)}
           </button>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-slate-500 bg-slate-50 rounded-full hover:bg-slate-100">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="sticky top-[69px] z-20 bg-slate-50/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search age, notes, or date..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 rounded-xl border-slate-200 focus:border-rose-500 focus:ring-rose-500 text-sm shadow-sm bg-white"
                />
                {searchText && (
                    <button 
                        onClick={() => setSearchText('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                        <XCircle size={16} />
                    </button>
                )}
            </div>

            {/* Filters & Toggle */}
            <div className="flex justify-between items-center gap-3">
                {/* Mood Chips */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1 mask-linear-fade">
                    <button
                        onClick={() => setFilterMood('ALL')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                            filterMood === 'ALL' 
                            ? 'bg-slate-800 text-white shadow-md' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        All
                    </button>
                    {(Object.keys(MOOD_CONFIG) as Mood[]).map(mood => {
                        const isActive = filterMood === mood;
                        const config = MOOD_CONFIG[mood];
                        return (
                            <button
                                key={mood}
                                onClick={() => setFilterMood(mood)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                    isActive
                                    ? `${config.color} ring-2 ring-offset-1 ring-slate-200 shadow-sm`
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <span>{config.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* View Toggle */}
                <div className="flex bg-white rounded-lg border border-slate-200 p-1 shrink-0 shadow-sm">
                    <button 
                        onClick={() => setViewMode('card')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'card' ? 'bg-rose-100 text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Card View"
                    >
                        <LayoutGrid size={18} />
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-rose-100 text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        title="List View"
                    >
                        <LayoutList size={18} />
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        {memories.length === 0 && !isModalOpen ? (
          <div className="text-center py-20 text-slate-400">
            <div className="bg-slate-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon size={32} />
            </div>
            <p>No memories yet.</p>
            <p className="text-sm">Tap + to start your journal.</p>
          </div>
        ) : (
          <div className={viewMode === 'card' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6" : "space-y-4 max-w-3xl mx-auto"}>
            {filteredMemories.length === 0 ? (
                 <div className="col-span-full text-center py-10 text-slate-400">
                    <p>No memories match your search.</p>
                 </div>
            ) : (
                filteredMemories.map(memory => (
                    viewMode === 'card' ? (
                        <MemoryCard 
                            key={memory.id} 
                            memory={memory} 
                            onDelete={handleDeleteMemory}
                            onEdit={openEditModal}
                        />
                    ) : (
                        <MemoryListItem
                            key={memory.id}
                            memory={memory}
                            onDelete={handleDeleteMemory}
                            onEdit={openEditModal}
                        />
                    )
                ))
            )}
          </div>
        )}
      </main>

      {/* Add/Edit Memory Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-200">
             
             {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-white shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? 'Edit Memory' : 'New Memory'}
              </h2>
              <button onClick={closeModal} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {/* Date Picker */}
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Photo Date</label>
                <div className="flex gap-2 items-center">
                    <input
                    type="date"
                    value={photoDate}
                    onChange={(e) => setPhotoDate(e.target.value)}
                    className="flex-1 rounded-xl border-slate-200 focus:border-rose-500 focus:ring-rose-500"
                    />
                    {profile && (
                    <span className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl border border-rose-100 whitespace-nowrap">
                        {calculateAge(profile.birthday, photoDate)}
                    </span>
                    )}
                </div>
                </div>

                {/* Image Upload */}
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Photos</label>
                <div className="grid grid-cols-3 gap-2">
                    {selectedFiles.map((img, idx) => (
                    <div key={img.id} className="aspect-square rounded-xl overflow-hidden bg-slate-100 relative group">
                        <img src={img.base64} alt="preview" className="w-full h-full object-cover" />
                        <button 
                        onClick={() => handleRemoveFile(img.id)}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-md opacity-80 hover:opacity-100"
                        >
                        <X size={12} />
                        </button>
                    </div>
                    ))}
                    <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-rose-400 hover:text-rose-500 hover:bg-rose-50 transition-all bg-slate-50">
                    <Plus size={24} />
                    <span className="text-xs mt-1 font-medium">Add Photo</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                    </label>
                </div>
                {isAnalyzing && (
                    <div className="flex items-center gap-2 text-rose-500 text-sm mt-2 animate-pulse font-medium">
                        <Sparkles size={14} />
                        Gemini is analyzing your photo...
                    </div>
                )}
                </div>

                {/* Mood Selector */}
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mood</label>
                <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(MOOD_CONFIG) as Mood[]).map((mood) => {
                    const config = MOOD_CONFIG[mood];
                    const isSelected = selectedMood === mood;
                    const Icon = config.icon;
                    return (
                        <button
                            key={mood}
                            onClick={() => setSelectedMood(mood)}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 ${
                            isSelected 
                                ? `${config.color} ring-2 ring-offset-1 ring-rose-200 scale-105 shadow-sm` 
                                : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <Icon size={20} className="mb-1" />
                            <span className="text-xs font-medium">{config.label}</span>
                        </button>
                    )
                    })}
                </div>
                </div>

                {/* Note */}
                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-xl border-slate-200 focus:border-rose-500 focus:ring-rose-500 h-24 resize-none"
                    placeholder="What happened today?"
                />
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <Button 
                onClick={handleSaveMemory} 
                className="w-full py-3 text-base shadow-rose-200"
                disabled={selectedFiles.length === 0}
                isLoading={isSaving}
              >
                {isSaving ? 'Saving to Cloud...' : (editingId ? 'Update Memory' : 'Save Memory')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      {!isModalOpen && (
        <button
          onClick={openAddModal}
          className="fixed bottom-6 right-6 w-14 h-14 bg-rose-500 text-white rounded-full shadow-xl shadow-rose-300 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-20"
        >
          <Plus size={28} />
        </button>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={profile}
        onSave={handleSaveProfile}
      />

      <GoogleSetupModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />
    </div>
  );
};

export default App;
