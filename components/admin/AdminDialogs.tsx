'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface AdminDialogsProps {
  editingParticipant: { id: string; name: string; players: string[] } | null;
  setEditingParticipant: (p: { id: string; name: string; players: string[] } | null) => void;
  newPlayers: string;
  setNewPlayers: (val: string) => void;
  updatePlayers: () => void;

  showAddParticipant: boolean;
  setShowAddParticipant: (val: boolean) => void;
  addParticipantName: string;
  setAddParticipantName: (val: string) => void;
  addParticipantPlayers: string;
  setAddParticipantPlayers: (val: string) => void;
  handleAddParticipant: () => void;

  showClearConfirm: boolean;
  setShowClearConfirm: (val: boolean) => void;
  clearData: () => void;
}

export function AdminDialogs({
  editingParticipant,
  setEditingParticipant,
  newPlayers,
  setNewPlayers,
  updatePlayers,
  showAddParticipant,
  setShowAddParticipant,
  addParticipantName,
  setAddParticipantName,
  addParticipantPlayers,
  setAddParticipantPlayers,
  handleAddParticipant,
  showClearConfirm,
  setShowClearConfirm,
  clearData,
}: AdminDialogsProps) {
  return (
    <>
      {/* Edit Players Dialog */}
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

      {/* Add Participant Dialog */}
      <Dialog open={showAddParticipant} onOpenChange={(open) => !open && setShowAddParticipant(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Participant</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Participant Name</label>
              <Input 
                value={addParticipantName} 
                onChange={(e) => setAddParticipantName(e.target.value)}
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Golfers (comma-separated, typically 3)</label>
              <Input 
                value={addParticipantPlayers} 
                onChange={(e) => setAddParticipantPlayers(e.target.value)}
                placeholder="Scottie Scheffler, Rory McIlroy, Xander Schauffele"
              />
              <p className="text-xs text-muted-foreground mt-1">Enter drafted golfers, separated by commas.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddParticipant(false)}>Cancel</Button>
            <Button onClick={handleAddParticipant} className="bg-[#00365F]">Add Participant</Button>
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
    </>
  );
}
