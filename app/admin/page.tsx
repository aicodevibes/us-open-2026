// app/admin/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Database, UserPlus, Trash2, DollarSign, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ParticipantTables } from '@/components/admin/ParticipantTables';
import { AdminDialogs } from '@/components/admin/AdminDialogs';

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
  syncParticipantNamesAction
} from '@/app/actions/admin';

/**
 * AdminPage Component
 * 
 * Provides an administrative interface for managing the US Open dashboard.
 * Requires Google Authentication with an authorized email address.
 * 
 * All mutations are handled securely on the server via Next.js Server Actions.
 */
export default function AdminPage() {
  const { user, loading: authLoading, isAdmin, login, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fetchingScores, setFetchingScores] = useState(false);
  const [finalizingPlayoff, setFinalizingPlayoff] = useState(false);
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

  useEffect(() => {
    if (!authLoading) {
      if (user && isAdmin) {
        loadData().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [authLoading, user, isAdmin]);

  /**
   * Fetches participants, player scores, and tournament configuration from Firestore.
   */
  const loadData = async () => {
    try {
      const pSnap = await getDocs(collection(db, 'usopen_participants'));
      setParticipants(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; players: string[] })));

      const gSnap = await getDocs(collection(db, 'usopen_greedyParticipants'));
      setGreedyParticipants(gSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; player: string })));

      const sSnap = await getDocs(collection(db, 'usopen_playerScores'));
      setScores(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; playerName: string; day1: number; day2: number; day3: number; day4: number; isCut?: boolean })));

      const cSnap = await getDocs(collection(db, 'usopen_config'));
      const configDoc = cSnap.docs.find(d => d.id === 'tournament');
      if (configDoc && configDoc.data().cutline !== undefined) {
        setCutline(configDoc.data().cutline === null ? '' : configDoc.data().cutline);
      }
    } catch (e) {
      console.error('Error loading admin data:', e);
      toast.error('Failed to load live database records');
    }
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (e) {
      toast.error('Login failed');
    }
  };

  const seedParticipants = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      await seedParticipantsAction(token);
      toast.success('Participants seeded successfully');
      await loadData();
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
      await seedGreedyParticipantsAction(token);
      toast.success('Greedy participants seeded successfully');
      await loadData();
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
      const result = await syncScoresAction(token);
      if (result.message) {
        toast.success(result.message);
      } else {
        toast.success(`Synced ${result.updatedCount} player scores from ESPN`);
      }
      await loadData();
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
      const data = await finalizePlayoffAction(token);
      if (data.fetchedPlayers && data.fetchedPlayers.length > 0) {
        toast.success(`Standings finalized! Tie-breaker fetched for: ${data.fetchedPlayers.join(', ')}`);
      } else {
        toast.success('Standings finalized! No ties detected in Top 4.');
      }
      await loadData();
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
      await clearAllDataAction(token);
      toast.success('All data cleared successfully');
      setParticipants([]);
      setScores([]);
      setGreedyParticipants([]);
      setShowClearConfirm(false);
      await loadData();
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
      const result = await syncParticipantNamesAction(token);
      toast.success(`Participant names synced for ${result.count} entries`);
      await loadData();
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
      await deleteParticipantAction(token, id);
      toast.success('Participant deleted');
      await loadData();
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
      await updateParticipantPlayersAction(token, editingParticipant.id, playersArray);
      toast.success('Players updated');
      setEditingParticipant(null);
      await loadData();
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
      await addParticipantAction(token, addParticipantName.trim(), playersArray);
      toast.success('Participant added successfully');
      setShowAddParticipant(false);
      setAddParticipantName('');
      setAddParticipantPlayers('');
      await loadData();
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
      await updateCutlineAction(token, val);
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
            <CardDescription className="text-white/80">Only authorized admins can manage this draft.</CardDescription>
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

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-8 min-h-screen">
      <div className="flex justify-between items-center border-b-2 border-[#00365F] pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#00365F] p-2 rounded-lg">
            <Database className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#00365F] font-serif uppercase">Tournament Control</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={logout} className="border-[#00365F] text-[#00365F] hover:bg-[#00365F] hover:text-white">Logout</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-[#00365F]/10">
          <CardHeader className="bg-[#F4F8FA]">
            <CardTitle className="flex items-center gap-2 text-[#00365F]">
              <Database className="w-5 h-5" />
              Data Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap gap-2">
              <Button onClick={seedParticipants} className="bg-[#00365F] hover:bg-[#001A2E]">
                <UserPlus className="w-4 h-4 mr-2" />
                Seed Participants
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
                Clear All Data
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#D4AF37]">
          <CardHeader className="bg-[#D4AF37]/10">
            <CardTitle className="flex items-center gap-2 text-[#001A2E]">
              <RefreshCw className={`w-5 h-5 ${fetchingScores ? 'animate-spin' : ''}`} />
              ESPN Live Score Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Button onClick={handleFetchScores} disabled={fetchingScores} className="w-full bg-[#00365F] hover:bg-[#001A2E] text-white py-6 text-lg font-bold">
              {fetchingScores ? 'Fetching from ESPN...' : 'Fetch Latest Scores'}
            </Button>
            <p className="text-sm text-muted-foreground italic text-center">
              Triggers a secure server-side synchronization of scores from the ESPN leaderboard API.
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#00365F]/10 md:col-span-2">
          <CardHeader className="bg-[#F4F8FA]">
            <CardTitle className="flex items-center gap-2 text-[#00365F]">
              Tournament Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-end gap-4 max-w-sm">
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium text-[#001A2E]">Manual Cutline (e.g. 4 for +4)</label>
                <Input 
                  type="number" 
                  value={cutline} 
                  onChange={(e) => setCutline(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Leave empty to use automatic data"
                />
              </div>
              <Button onClick={updateCutline} className="bg-[#00365F] hover:bg-[#001A2E]">Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If set, any player whose Day 1 + Day 2 score is strictly greater than this value will be marked as cut, overriding the ESPN status.
            </p>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#D4AF37]/50 md:col-span-2">
          <CardHeader className="bg-[#00365F] text-white">
            <CardTitle className="flex items-center gap-2">
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
            <p className="text-sm text-muted-foreground italic text-center">
              Triggers the final tie-breaker calculation. It fetches hole-by-hole data from ESPN for tied players, saves the playoff scorecard, and reveals the official Final Standings on the public dashboard.
            </p>
          </CardContent>
        </Card>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>Live Player Scores ({scores.length})</CardTitle>
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
    </div>
  );
}
