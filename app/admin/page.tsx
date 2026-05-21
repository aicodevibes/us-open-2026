'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, doc, setDoc, getDocs, writeBatch, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Database, UserPlus, Trash2, Edit, DollarSign, Trophy } from 'lucide-react';
import { getAuthorizedEmails, ESPN_EVENT_ID } from '@/lib/constants';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
const INITIAL_PARTICIPANTS = [
  { name: 'Bruce', players: ['Scottie Scheffler', 'Chris Gotterup', 'J.J. Spaun'] },
  { name: 'Greg', players: ['Rory McIlroy', 'Viktor Hovland', 'Nicolai Højgaard'] },
  { name: 'Pat', players: ['Cameron Young', 'Patrick Reed', 'Jacob Bridgeman'] },
  { name: 'Robbie', players: ['Matt Fitzpatrick', 'Tyrrell Hatton', 'Shane Lowry'] },
  { name: 'Clay', players: ['Tommy Fleetwood', 'Jordan Spieth', 'Jason Day'] },
  { name: 'Cole', players: ['Xander Schauffele', 'Brooks Koepka', 'Adam Scott'] },
  { name: 'Jim', players: ['Ludvig Åberg', 'Si Woo Kim', 'Sam Burns'] },
  { name: 'Garis', players: ['Justin Rose', 'Rickie Fowler', 'Alex Fitzpatrick'] },
  { name: 'Billy Fred', players: ['Jon Rahm', 'Matt McCarty', 'Keegan Bradley'] },
  { name: 'Dereck', players: ['Justin Thomas', 'Russell Henley', 'Harry Hall'] },
  { name: 'Scott', players: ['Bryson DeChambeau', 'Patrick Cantlay', 'Ben Griffin'] },
  { name: 'Roby', players: ['Collin Morikawa', 'Robert MacIntyre', 'Corey Conners'] }
];

const INITIAL_GREEDY_PARTICIPANTS = [
  { name: 'Scott', player: 'Sungjae Im' },
  { name: 'Dereck', player: 'Harris English' },
  { name: 'Billy Fred', player: 'Kurt Kitayama' },
  { name: 'Jim', player: 'Max Homa' },
  { name: 'Cole', player: 'Min Woo Lee' },
  { name: 'Clay', player: 'Gary Woodland' },
  { name: 'Robbie', player: 'Akshay Bhatia' }
];

/**
 * AdminPage Component
 * 
 * Provides an administrative interface for managing the US Open dashboard.
 * Requires Google Authentication with an authorized email address.
 * 
 * Features:
 * - Real-time monitoring of participants and scores.
 * - Manual score sync trigger.
 * - Database seeding with tournament rosters.
 * - Database clearing (destructive).
 * - Individual participant management (edit/delete).
 */
export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        loadData();
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetches participants, player scores, and tournament configuration from Firestore.
   * Populates the local state for the admin dashboard tables.
   */
  const loadData = async () => {
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
  };

  /**
   * Initiates the Google OAuth login flow.
   * Required for administrative access.
   */
  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      toast.error('Login failed');
    }
  };

  /**
   * Seeds the 'participants' collection with the hardcoded INITIAL_PARTICIPANTS array.
   * This is used for initial setup or after a database clear.
   */
  const seedParticipants = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      INITIAL_PARTICIPANTS.forEach((p) => {
        const ref = doc(collection(db, 'usopen_participants'));
        batch.set(ref, p);
      });
      await batch.commit();
      toast.success('Participants seeded successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to seed participants');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Seeds the 'greedyParticipants' collection with the side-game roster.
   */
  const seedGreedyParticipants = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      INITIAL_GREEDY_PARTICIPANTS.forEach((p) => {
        const ref = doc(collection(db, 'usopen_greedyParticipants'));
        batch.set(ref, p);
      });
      await batch.commit();
      toast.success('Greedy participants seeded successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to seed greedy participants');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Manually fetches live scores from the ESPN API and updates the 'playerScores' collection.
   * Also updates the 'lastUpdated' timestamp in the tournament configuration.
   */
  const handleFetchScores = async () => {
    if (!user) return;
    setFetchingScores(true);
    try {
      // 1. Fetch from ESPN directly (client-side CORS is supported)
      const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?event=${ESPN_EVENT_ID}`;
      const res = await fetch(espnUrl);
      if (!res.ok) throw new Error(`ESPN API returned HTTP ${res.status}`);
      
      const espnData = await res.json();
      const event = espnData.events?.[0];
      if (!event) throw new Error('No event found in ESPN response');
      
      const statusState = event.status?.type?.state;
      const isPreEvent = statusState === 'pre';
      const competitors = event.competitions[0].competitors;

      console.log(`Syncing scores for ${competitors.length} competitors...`);

      const batch = writeBatch(db);
      let updatedCount = 0;

      competitors.forEach((c: any) => {
        const rounds = [0, 0, 0, 0];
        const isCut = c.score === 'CUT' || 
                    c.status?.type?.name === 'STATUS_CUT' || 
                    c.status?.type?.description?.toLowerCase().includes('cut');

        if (!isPreEvent && c.linescores) {
          c.linescores.forEach((ls: any) => {
            if (ls.period >= 1 && ls.period <= 4) {
              const scoreVal = parseInt(ls.displayValue || ls.value || '0');
              rounds[ls.period - 1] = isNaN(scoreVal) ? 0 : scoreVal;
            }
          });
        }

        const playerName = c.athlete.displayName || c.athlete.fullName;
        const scoreRef = doc(db, 'usopen_playerScores', playerName);
        batch.set(scoreRef, {
          playerName,
          day1: rounds[0],
          day2: rounds[1],
          day3: rounds[2],
          day4: rounds[3],
          isCut: !!isCut
        }, { merge: true });
        updatedCount++;
      });

      // Update timestamp
      const configRef = doc(db, 'usopen_config', 'tournament');
      batch.set(configRef, { lastUpdated: serverTimestamp() }, { merge: true });

      await batch.commit();
      
      toast.success(`Synced ${updatedCount} player scores from ESPN`);
      loadData();
    } catch (e) {
      console.error('Fetch scores error:', e);
      toast.error(e instanceof Error ? e.message : 'Error syncing scores');
    } finally {
      setFetchingScores(false);
    }
  };

  /**
   * Triggers the scorecard playoff tie-breaker logic and finalizes the tournament standings.
   */
  const handleFinalizePlayoff = async () => {
    if (!confirm('Are you sure you want to finalize the standings? This will run the scorecard playoff tie-breakers.')) return;
    setFinalizingPlayoff(true);
    try {
      const res = await fetch('/api/finalize-standings', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to finalize standings');
      const data = await res.json();
      if (data.fetchedPlayers && data.fetchedPlayers.length > 0) {
        toast.success(`Standings finalized! Tie-breaker fetched for: ${data.fetchedPlayers.join(', ')}`);
      } else {
        toast.success('Standings finalized! No ties detected in Top 4.');
      }
      loadData();
    } catch (e) {
      toast.error('Error finalizing standings');
      console.error(e);
    } finally {
      setFinalizingPlayoff(false);
    }
  };

  /**
   * Completely clears the participants and playerScores collections.
   * This is a destructive operation used for database resets.
   */
  const clearData = async () => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, 'usopen_participants'));
      const sSnap = await getDocs(collection(db, 'usopen_playerScores'));
      const cSnap = await getDocs(collection(db, 'usopen_config'));
      
      const batch = writeBatch(db);
      pSnap.docs.forEach(d => batch.delete(d.ref));
      sSnap.docs.forEach(d => batch.delete(d.ref));
      cSnap.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      toast.success('All data cleared successfully');
      setParticipants([]);
      setScores([]);
      setShowClearConfirm(false);
      loadData();
    } catch (e) {
      console.error('Clear data error:', e);
      toast.error('Failed to clear data');
    } finally {
      setLoading(false);
    }
  };

  const syncParticipantNames = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      // We'll update the existing participants in the DB to match the INITIAL_PARTICIPANTS names
      // This fixes issues like 'Rory Mcllroy' -> 'Rory McIlroy'
      const pSnap = await getDocs(collection(db, 'usopen_participants'));
      pSnap.docs.forEach((docSnap) => {
        const currentData = docSnap.data();
        const matchingInitial = INITIAL_PARTICIPANTS.find(p => p.name === currentData.name);
        if (matchingInitial) {
          batch.update(docSnap.ref, { players: matchingInitial.players });
        }
      });
      await batch.commit();
      toast.success('Participant names synced with latest API format');
      loadData();
    } catch (e) {
      toast.error('Failed to sync names');
    } finally {
      setLoading(false);
    }
  };

  const deleteParticipant = async (id: string) => {
    if (!confirm('Are you sure you want to delete this participant?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'usopen_participants', id));
      toast.success('Participant deleted');
      loadData();
    } catch (e) {
      toast.error('Failed to delete participant');
    } finally {
      setLoading(false);
    }
  };

  const updatePlayers = async () => {
    if (!editingParticipant) return;
    setLoading(true);
    try {
      const playersArray = newPlayers.split(',').map(p => p.trim()).filter(p => p !== '');
      await updateDoc(doc(db, 'usopen_participants', editingParticipant.id), {
        players: playersArray
      });
      toast.success('Players updated');
      setEditingParticipant(null);
      loadData();
    } catch (e) {
      toast.error('Failed to update players');
    } finally {
      setLoading(false);
    }
  };

  const updateCutline = async () => {
    setLoading(true);
    try {
      const val = cutline === '' ? null : Number(cutline);
      await setDoc(doc(db, 'usopen_config', 'tournament'), { cutline: val }, { merge: true });
      toast.success('Cutline updated');
    } catch (e) {
      toast.error('Failed to update cutline');
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

  const authorizedEmails = getAuthorizedEmails();

  if (!user || !authorizedEmails.includes(user.email || '')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#F4F8FA]">
        <Card className="w-full max-w-md border-2 border-[#00365F]">
          <CardHeader className="bg-[#00365F] text-white">
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription className="text-white/80">Only authorized admins can manage this draft.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Button onClick={login} className="w-full bg-[#00365F] hover:bg-[#001A2E]">Login with Google</Button>
            {user && !authorizedEmails.includes(user.email || '') && (
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
          <Button variant="outline" onClick={() => auth.signOut()} className="border-[#00365F] text-[#00365F] hover:bg-[#00365F] hover:text-white">Logout</Button>
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
              Gemini AI Score Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Button onClick={handleFetchScores} disabled={fetchingScores} className="w-full bg-[#00365F] hover:bg-[#001A2E] text-white py-6 text-lg font-bold">
              {fetchingScores ? 'Fetching from ESPN...' : 'Fetch Latest Scores'}
            </Button>
            <p className="text-sm text-muted-foreground italic text-center">
              Fetches live scores directly from ESPN and updates the leaderboard via the sync API.
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
                  placeholder="Leave empty to use AI data"
                />
              </div>
              <Button onClick={updateCutline} className="bg-[#00365F] hover:bg-[#001A2E]">Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              If set, any player whose Day 1 + Day 2 score is strictly greater than this value will be marked as cut, overriding the AI status.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <Card className="border-2 border-[#00365F]/10">
          <CardHeader className="bg-[#00365F] text-white">
            <CardTitle className="text-lg">Main Participants ({participants.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold">Players</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{p.players.join(', ')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-[#00365F]"
                          onClick={() => {
                            setEditingParticipant(p);
                            setNewPlayers(p.players.join(', '));
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => deleteParticipant(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-2 border-[#D4AF37]/30">
          <CardHeader className="bg-[#D4AF37] text-[#001A2E]">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Greedy Game Participants ({greedyParticipants.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold">Assigned Player</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {greedyParticipants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold text-[#00365F]">{p.name}</TableCell>
                    <TableCell className="text-sm font-medium">{p.player}</TableCell>
                  </TableRow>
                ))}
                {greedyParticipants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground italic">
                      No greedy participants seeded.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingParticipant} onOpenChange={(open) => !open && setEditingParticipant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Players for {editingParticipant?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">Enter player names separated by commas:</p>
            <Input 
              value={newPlayers} 
              onChange={(e) => setNewPlayers(e.target.value)}
              placeholder="Scottie Scheffler, Jon Rahm, ..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingParticipant(null)}>Cancel</Button>
            <Button onClick={updatePlayers} className="bg-[#00365F]">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Data Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={(open) => !open && setShowClearConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>all participants, player scores, and tournament config</strong>. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={clearData}>Yes, Clear Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
