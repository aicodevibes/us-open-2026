// app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Database, UserPlus, Trash2, DollarSign, Trophy, Plus, Calendar, Check, Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ParticipantTables } from '@/components/admin/ParticipantTables';
import { AdminDialogs } from '@/components/admin/AdminDialogs';
import { getActiveEventIdClient, getAllEventsClient } from '@/lib/events';
import { TournamentEvent, EspnCalendarEvent } from '@/types';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import {
  seedParticipantsAction,
  seedGreedyParticipantsAction,
  clearAllDataAction,
  syncScoresAction,
  finalizePlayoffAction,
  addParticipantAction,
  deleteParticipantAction,
  updateParticipantPlayersAction,
  updateCutlineAction,
  syncParticipantNamesAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  setActiveEventAction,
  getUpcomingEspnEventsAction
} from '@/app/actions/admin';

/**
 * AdminPage Component
 * 
 * Provides an administrative interface for managing events and drafts.
 * Requires Google Authentication with an authorized email address.
 */
export default function AdminPage() {
  const { user, loading: authLoading, isAdmin, login, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fetchingScores, setFetchingScores] = useState(false);
  const [finalizingPlayoff, setFinalizingPlayoff] = useState(false);
  
  // Event state
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState<string>('');
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [upcomingEvents, setUpcomingEvents] = useState<EspnCalendarEvent[]>([]);
  const [fetchingUpcoming, setFetchingUpcoming] = useState(false);

  // Selected event form fields
  const [eventName, setEventName] = useState('');
  const [eventSubtitle, setEventSubtitle] = useState('');
  const [eventEspnId, setEventEspnId] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  // Create event dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSubtitle, setCreateSubtitle] = useState('Draft Dashboard');
  const [createEspnId, setCreateEspnId] = useState('');
  const [createStartDate, setCreateStartDate] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createMakeActive, setCreateMakeActive] = useState(true);

  // Participant and score data for the selected event
  const [participants, setParticipants] = useState<{ id: string; name: string; players: string[] }[]>([]);
  const [greedyParticipants, setGreedyParticipants] = useState<{ id: string; name: string; player: string }[]>([]);
  const [scores, setScores] = useState<{ id: string; playerName: string; day1: number; day2: number; day3: number; day4: number; isCut?: boolean }[]>([]);
  const [editingParticipant, setEditingParticipant] = useState<{ id: string; name: string; players: string[] } | null>(null);
  const [newPlayers, setNewPlayers] = useState<string>('');
  const [cutline, setCutline] = useState<number | ''>('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [addParticipantName, setAddParticipantName] = useState('');
  const [addParticipantPlayers, setAddParticipantPlayers] = useState('');

  const fetchUpcomingEvents = useCallback(async () => {
    setFetchingUpcoming(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const data = await getUpcomingEspnEventsAction(token);
      setUpcomingEvents(data);
    } catch (e) {
      console.error('Failed to fetch upcoming schedule:', e);
    } finally {
      setFetchingUpcoming(false);
    }
  }, []);

  /**
   * Initializes page data: fetches events list, active ID, and ESPN schedule.
   */
  const initAdmin = useCallback(async () => {
    try {
      const activeId = await getActiveEventIdClient();
      setActiveEventId(activeId);

      const allEvents = await getAllEventsClient();
      setEvents(allEvents);

      if (allEvents.length > 0) {
        const defaultSelected = selectedEventId || activeId || allEvents[0].id;
        setSelectedEventId(defaultSelected);

        const selected = allEvents.find(e => e.id === defaultSelected);
        if (selected) {
          setEventName(selected.name);
          setEventSubtitle(selected.subtitle);
          setEventEspnId(selected.espnEventId);
          setEventStartDate(selected.startDate || '');
          setEventEndDate(selected.endDate || '');
        }
      }

      // Fetch upcoming tour schedule from ESPN
      fetchUpcomingEvents();
    } catch (e) {
      console.error('Error initializing admin page:', e);
      toast.error('Failed to load initial event list');
    }
  }, [selectedEventId, fetchUpcomingEvents]);

  /**
   * Fetches subcollection data for the selected event.
   */
  const loadEventSubcollections = useCallback(async (eventId: string) => {
    try {
      const eventRef = doc(db, 'golf_events', eventId);

      const pSnap = await getDocs(collection(eventRef, 'participants'));
      setParticipants(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; players: string[] })));

      const gSnap = await getDocs(collection(eventRef, 'greedyParticipants'));
      setGreedyParticipants(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; player: string })));

      const sSnap = await getDocs(collection(eventRef, 'playerScores'));
      setScores(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; playerName: string; day1: number; day2: number; day3: number; day4: number; isCut?: boolean })));

      const eventDocSnap = await getDoc(eventRef);
      if (eventDocSnap.exists()) {
        const configData = eventDocSnap.data();
        setCutline(configData.cutline === null || configData.cutline === undefined ? '' : configData.cutline);
      }
    } catch (e) {
      console.error('Error loading event subcollections:', e);
      toast.error('Failed to load roster data for selected event');
    }
  }, []);

  useEffect(() => {
    if (!authLoading) {
      if (user && isAdmin) {
        initAdmin().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [authLoading, user, isAdmin, initAdmin]);

  // Load event-specific subcollections when selectedEventId changes
  useEffect(() => {
    if (user && isAdmin && selectedEventId) {
      loadEventSubcollections(selectedEventId);
    }
  }, [selectedEventId, user, isAdmin, loadEventSubcollections]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchUpcomingEvents();
    }
  }, [user, isAdmin, fetchUpcomingEvents]);

  /**
   * Refreshes active event details
   */
  const refreshEventList = async () => {
    try {
      const allEvents = await getAllEventsClient();
      setEvents(allEvents);
      const selected = allEvents.find(e => e.id === selectedEventId);
      if (selected) {
        setEventName(selected.name);
        setEventSubtitle(selected.subtitle);
        setEventEspnId(selected.espnEventId);
        setEventStartDate(selected.startDate || '');
        setEventEndDate(selected.endDate || '');
      }
    } catch (e) {
      console.error('Failed to refresh events list:', e);
    }
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (e) {
      toast.error('Login failed');
    }
  };

  // Event Mutations
  const handleUpdateEvent = async () => {
    if (!eventName.trim() || !eventEspnId.trim()) {
      toast.error('Event Name and ESPN Event ID are required');
      return;
    }
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await updateEventAction(token, selectedEventId, eventName.trim(), eventEspnId.trim(), eventSubtitle.trim(), eventStartDate, eventEndDate, false);
      toast.success('Tournament details updated successfully');
      await refreshEventList();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update event details');
    } finally {
      setLoading(false);
    }
  };

  const handleSetActiveEvent = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await setActiveEventAction(token, selectedEventId);
      setActiveEventId(selectedEventId);
      toast.success('Active event updated successfully');
      await refreshEventList();
    } catch (e: any) {
      toast.error(e.message || 'Failed to set active event');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!confirm('Are you sure you want to delete this event and all associated participants, greedy rosters, and scores? This cannot be undone.')) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await deleteEventAction(token, selectedEventId);
      toast.success('Event deleted');
      setSelectedEventId('');
      await initAdmin();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete event');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!createName.trim() || !createEspnId.trim()) {
      toast.error('Event Name and ESPN Event ID are required');
      return;
    }
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const result = await createEventAction(token, createName.trim(), createEspnId.trim(), createSubtitle.trim(), createStartDate, createEndDate, createMakeActive);
      toast.success('Tournament event created successfully');
      
      // Select the newly created event
      setSelectedEventId(result.eventId);
      setShowCreateDialog(false);
      
      // Reset creation form
      setCreateName('');
      setCreateSubtitle('Draft Dashboard');
      setCreateEspnId('');
      setCreateStartDate('');
      setCreateEndDate('');

      await initAdmin();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUpcomingEvent = async (calendarItem: EspnCalendarEvent) => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      
      const result = await createEventAction(
        token, 
        calendarItem.label, 
        calendarItem.id, 
        'Draft Dashboard', 
        calendarItem.startDate, 
        calendarItem.endDate, 
        true // Make active by default
      );

      toast.success(`Created event "${calendarItem.label}" and set it as active!`);
      setSelectedEventId(result.eventId);
      await initAdmin();
    } catch (e: any) {
      toast.error(e.message || 'Failed to import event from ESPN');
    } finally {
      setLoading(false);
    }
  };

  // Draft Mutations (specific to selected event)
  const seedParticipants = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await seedParticipantsAction(token, selectedEventId);
      toast.success('Participants seeded successfully');
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to seed participants');
    } finally {
      setLoading(false);
    }
  };

  const seedGreedyParticipants = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await seedGreedyParticipantsAction(token, selectedEventId);
      toast.success('Greedy participants seeded successfully');
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to seed greedy participants');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchScores = async () => {
    if (!user) return;
    setFetchingScores(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const result = await syncScoresAction(token, selectedEventId);
      if (result.message) {
        toast.success(result.message);
      } else {
        toast.success(`Synced ${result.updatedCount} player scores from ESPN`);
      }
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      console.error('Fetch scores error:', e);
      toast.error(e.message || 'Error syncing scores');
    } finally {
      setFetchingScores(false);
    }
  };

  const handleFinalizePlayoff = async () => {
    if (!confirm('Are you sure you want to finalize the standings? This will run the scorecard playoff tie-breakers.')) return;
    setFinalizingPlayoff(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const data = await finalizePlayoffAction(token, selectedEventId);
      if (data.fetchedPlayers && data.fetchedPlayers.length > 0) {
        toast.success(`Standings finalized! Tie-breaker fetched for: ${data.fetchedPlayers.join(', ')}`);
      } else {
        toast.success('Standings finalized! No ties detected in Top 4.');
      }
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Error finalizing standings');
      console.error(e);
    } finally {
      setFinalizingPlayoff(false);
    }
  };

  const clearData = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await clearAllDataAction(token, selectedEventId);
      toast.success('Event rosters and scores cleared successfully');
      setParticipants([]);
      setScores([]);
      setGreedyParticipants([]);
      setShowClearConfirm(false);
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      console.error('Clear data error:', e);
      toast.error(e.message || 'Failed to clear data');
    } finally {
      setLoading(false);
    }
  };

  const syncParticipantNames = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const result = await syncParticipantNamesAction(token, selectedEventId);
      toast.success(`Participant names synced for ${result.count} entries`);
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync names');
    } finally {
      setLoading(false);
    }
  };

  const deleteParticipant = async (id: string) => {
    if (!confirm('Are you sure you want to delete this participant?')) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await deleteParticipantAction(token, selectedEventId, id);
      toast.success('Participant deleted');
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete participant');
    } finally {
      setLoading(false);
    }
  };

  const updatePlayers = async () => {
    if (!editingParticipant) return;
    setLoading(true);
    try {
      const playersArray = newPlayers.split(',').map(p => p.trim()).filter(p => p !== '');
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await updateParticipantPlayersAction(token, selectedEventId, editingParticipant.id, playersArray);
      toast.success('Players updated');
      setEditingParticipant(null);
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update players');
    } finally {
      setLoading(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!addParticipantName.trim()) {
      toast.error('Participant name is required');
      return;
    }
    const playersArray = addParticipantPlayers
      .split(',')
      .map(p => p.trim())
      .filter(p => p !== '');

    if (playersArray.length === 0) {
      toast.error('Please enter at least one golfer');
      return;
    }

    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await addParticipantAction(token, selectedEventId, addParticipantName.trim(), playersArray);
      toast.success('Participant added successfully');
      setShowAddParticipant(false);
      setAddParticipantName('');
      setAddParticipantPlayers('');
      await loadEventSubcollections(selectedEventId);
    } catch (e: any) {
      console.error('Add participant error:', e);
      toast.error(e.message || 'Failed to add participant');
    } finally {
      setLoading(false);
    }
  };

  const updateCutline = async () => {
    setLoading(true);
    try {
      const val = cutline === '' ? null : Number(cutline);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await updateCutlineAction(token, selectedEventId, val);
      toast.success('Cutline updated');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update cutline');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#F4F8FA]">
        <Card className="w-full max-w-md border-2 border-[#00365F]">
          <CardHeader className="bg-[#00365F] text-white">
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription className="text-white/80">Only authorized admins can manage these drafts.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Button onClick={handleLogin} className="w-full bg-[#00365F] hover:bg-[#001A2E]">Login with Google</Button>
            {user && !isAdmin && (
              <p className="text-destructive text-sm mt-4 text-center font-bold">
                Access Denied: {user.email} is not authorized.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-8 min-h-screen pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b-2 border-[#00365F] pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#00365F] p-2 rounded-lg">
            <Database className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#00365F] font-serif uppercase">Tournament Control</h1>
            <p className="text-xs text-muted-foreground">Manage multi-event tournaments and ESPN drafts</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={logout} className="border-[#00365F] text-[#00365F] hover:bg-[#00365F] hover:text-white ml-auto sm:ml-0">Logout</Button>
        </div>
      </div>

      {/* 1. Event Selection & Event Details Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-2 border-[#00365F] lg:col-span-2 shadow-sm">
          <CardHeader className="bg-[#00365F] text-white flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Event Selector & Configuration</CardTitle>
              <CardDescription className="text-white/70">Create, switch, or modify draft events</CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm" className="bg-[#D4AF37] text-[#001A2E] hover:bg-[#b08e2d] font-bold">
              <Plus className="w-4 h-4 mr-1" />
              New Event
            </Button>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#00365F]">Select Event to Manage</label>
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full p-2 border border-[#00365F]/20 rounded-md font-sans text-sm font-bold bg-white text-[#001A2E]"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.name} {evt.id === activeEventId ? '★ (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedEvent && (
              <div className="border-t border-[#00365F]/10 pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Event Name</label>
                    <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. The Masters 2026" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subtitle</label>
                    <Input value={eventSubtitle} onChange={(e) => setEventSubtitle(e.target.value)} placeholder="e.g. Draft Dashboard" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">ESPN Event ID</label>
                    <Input value={eventEspnId} onChange={(e) => setEventEspnId(e.target.value)} placeholder="e.g. 401811941" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Status / Active</label>
                    <div className="flex items-center gap-2 h-10">
                      {selectedEventId === activeEventId ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Currently Active
                        </Badge>
                      ) : (
                        <Button onClick={handleSetActiveEvent} size="sm" variant="outline" className="border-emerald-600 text-emerald-600 hover:bg-emerald-50">
                          Set as Active Dashboard Event
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Start Date (UTC / ISO 8601)</label>
                    <Input value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} placeholder="e.g. 2026-06-18T12:00:00Z" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">End Date (UTC / ISO 8601)</label>
                    <Input value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} placeholder="e.g. 2026-06-21T22:00:00Z" />
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#00365F]/5">
                  <Button onClick={handleUpdateEvent} className="bg-[#00365F] hover:bg-[#001A2E] text-white">
                    Save Event Details
                  </Button>
                  <Button onClick={handleDeleteEvent} variant="destructive" className="ml-auto">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Event
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. ESPN Tournaments Schedule / Upcoming events */}
        <Card className="border-2 border-[#D4AF37]/40 shadow-sm bg-[#FBF9F2]">
          <CardHeader className="bg-[#D4AF37]/10 pb-4">
            <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2 text-[#001A2E]">
              <Calendar className="w-4 h-4 text-[#D4AF37]" />
              Suggested Tournaments
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">PGA calendar loaded live from ESPN</CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            {fetchingUpcoming ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#00365F]" />
              </div>
            ) : upcomingEvents.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {upcomingEvents.map((item) => {
                  const alreadyExists = events.some(e => e.espnEventId === item.id);
                  const isItemActive = events.some(e => e.espnEventId === item.id && e.id === activeEventId);
                  
                  return (
                    <div key={item.id} className="p-2 rounded bg-white border border-[#D4AF37]/25 flex flex-col justify-between gap-2 shadow-xs">
                      <div>
                        <h4 className="text-xs font-bold text-[#00365F] line-clamp-1">{item.label}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] bg-[#001A2E]/5 px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                            ID: {item.id}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.startDate).toLocaleDateString([], {month: 'short', day: 'numeric'})}
                          </span>
                        </div>
                      </div>
                      <div>
                        {alreadyExists ? (
                          <Badge variant="outline" className={`w-full text-center justify-center flex py-1 text-[10px] ${isItemActive ? 'border-emerald-600 text-emerald-600 bg-emerald-50' : 'border-slate-300 text-slate-500'}`}>
                            {isItemActive ? 'Active Event' : 'Already Imported'}
                          </Badge>
                        ) : (
                          <Button 
                            onClick={() => handleCreateUpcomingEvent(item)} 
                            size="sm" 
                            className="w-full bg-[#D4AF37] hover:bg-[#b08e2d] text-[#001A2E] text-[10px] font-bold py-1 h-7"
                          >
                            Import & Set Active
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs opacity-50 italic text-center py-12">No schedule fetched from ESPN</p>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedEventId && (
        <>
          {/* 3. Main Data Management & Sync Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-[#00365F]/10 shadow-xs">
              <CardHeader className="bg-[#F4F8FA]">
                <CardTitle className="flex items-center gap-2 text-[#00365F] text-md">
                  <Database className="w-5 h-5" />
                  Roster & Seeding Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">
                  Seeding loads initial drafted rosters into the database for the selected event.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={seedParticipants} className="bg-[#00365F] hover:bg-[#001A2E]">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Seed Drafted Rosters
                  </Button>
                  <Button onClick={seedGreedyParticipants} variant="outline" className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-white">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Seed Greedy
                  </Button>
                  <Button onClick={syncParticipantNames} variant="outline" className="border-[#00365F] text-[#00365F]">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Draft Names
                  </Button>
                  <Button variant="destructive" onClick={() => setShowClearConfirm(true)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Reset Rosters & Config
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-[#D4AF37] shadow-xs">
              <CardHeader className="bg-[#D4AF37]/10">
                <CardTitle className="flex items-center gap-2 text-[#001A2E] text-md">
                  <RefreshCw className={`w-5 h-5 ${fetchingScores ? 'animate-spin' : ''}`} />
                  ESPN Live Score Sync
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Button onClick={handleFetchScores} disabled={fetchingScores} className="w-full bg-[#00365F] hover:bg-[#001A2E] text-white py-6 text-lg font-bold">
                  {fetchingScores ? 'Fetching from ESPN...' : 'Fetch Latest Scores'}
                </Button>
                <p className="text-xs text-muted-foreground italic text-center">
                  Syncs scores for ESPN tournament ID: <strong>{eventEspnId || selectedEventId}</strong>.
                </p>
              </CardContent>
            </Card>

            {/* Cutline Management */}
            <Card className="border-2 border-[#00365F]/10 md:col-span-2 shadow-xs">
              <CardHeader className="bg-[#F4F8FA]">
                <CardTitle className="text-md text-[#00365F]">Event Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-end gap-4 max-w-sm">
                  <div className="space-y-2 flex-1">
                    <label className="text-sm font-medium text-[#001A2E]">Manual Cutline (e.g. 4 for +4)</label>
                    <Input 
                      type="number" 
                      value={cutline} 
                      onChange={(e) => setCutline(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Leave empty to use automatic ESPN cutline"
                    />
                  </div>
                  <Button onClick={updateCutline} className="bg-[#00365F] hover:bg-[#001A2E]">Save</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  If set, any player whose Day 1 + Day 2 score is strictly greater than this value will be marked as cut, overriding the ESPN status.
                </p>
              </CardContent>
            </Card>

            {/* Finalization Playoff */}
            <Card className="border-2 border-[#D4AF37]/50 md:col-span-2 shadow-xs">
              <CardHeader className="bg-[#00365F] text-white">
                <CardTitle className="flex items-center gap-2 text-md">
                  <Trophy className="w-5 h-5 text-[#D4AF37]" />
                  Tournament Finalization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <Button 
                  onClick={handleFinalizePlayoff} 
                  disabled={finalizingPlayoff} 
                  className="w-full bg-[#D4AF37] hover:bg-[#8c7445] text-[#001A2E] py-6 text-lg font-bold uppercase tracking-widest"
                >
                  {finalizingPlayoff ? 'Running Playoff Logic...' : 'Run Scorecard Playoff & Show Final Standings'}
                </Button>
                <p className="text-xs text-muted-foreground italic text-center">
                  Calculates hole-by-hole playoff tie-breakers using ESPN scorecards for tied Top-4 participants in this event.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Participant Tables */}
          <ParticipantTables
            participants={participants}
            greedyParticipants={greedyParticipants}
            setShowAddParticipant={setShowAddParticipant}
            setEditingParticipant={setEditingParticipant}
            setNewPlayers={setNewPlayers}
            deleteParticipant={deleteParticipant}
          />

          <AdminDialogs
            editingParticipant={editingParticipant}
            setEditingParticipant={setEditingParticipant}
            newPlayers={newPlayers}
            setNewPlayers={setNewPlayers}
            updatePlayers={updatePlayers}
            showAddParticipant={showAddParticipant}
            setShowAddParticipant={setShowAddParticipant}
            addParticipantName={addParticipantName}
            setAddParticipantName={setAddParticipantName}
            addParticipantPlayers={addParticipantPlayers}
            setAddParticipantPlayers={setAddParticipantPlayers}
            handleAddParticipant={handleAddParticipant}
            showClearConfirm={showClearConfirm}
            setShowClearConfirm={setShowClearConfirm}
            clearData={clearData}
          />

          {/* Live Player Scores Table */}
          <Card className="shadow-xs border-2 border-[#00365F]/10">
            <CardHeader className="bg-[#F4F8FA]">
              <CardTitle className="text-md text-[#00365F]">Live Player Scores ({scores.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>R1</TableHead>
                    <TableHead>R2</TableHead>
                    <TableHead>R3</TableHead>
                    <TableHead>R4</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.playerName}</TableCell>
                      <TableCell>{s.day1}</TableCell>
                      <TableCell>{s.day2}</TableCell>
                      <TableCell>{s.day3}</TableCell>
                      <TableCell>{s.day4}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* 4. Create New Event Custom Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && setShowCreateDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Draft Event</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#00365F] uppercase">Event Name</label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Open Championship 2026" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#00365F] uppercase">Subtitle</label>
              <Input value={createSubtitle} onChange={(e) => setCreateSubtitle(e.target.value)} placeholder="Draft Dashboard" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#00365F] uppercase">ESPN Event ID</label>
              <Input value={createEspnId} onChange={(e) => setCreateEspnId(e.target.value)} placeholder="e.g. 401811952" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#00365F] uppercase">Start Date (ISO 8601)</label>
              <Input value={createStartDate} onChange={(e) => setCreateStartDate(e.target.value)} placeholder="2026-07-16T06:00:00Z" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#00365F] uppercase">End Date (ISO 8601)</label>
              <Input value={createEndDate} onChange={(e) => setCreateEndDate(e.target.value)} placeholder="2026-07-19T18:00:00Z" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input 
                type="checkbox" 
                id="create-make-active" 
                checked={createMakeActive} 
                onChange={(e) => setCreateMakeActive(e.target.checked)} 
                className="w-4 h-4"
              />
              <label htmlFor="create-make-active" className="text-xs font-medium text-[#001A2E] cursor-pointer">
                Set as Active Dashboard Event immediately
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateEvent} className="bg-[#00365F] hover:bg-[#001A2E] text-white">
              Create Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
