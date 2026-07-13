'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { UserPlus, Edit, Trash2, DollarSign } from 'lucide-react';

interface Participant {
  id: string;
  name: string;
  players: string[];
}

interface GreedyParticipant {
  id: string;
  name: string;
  player: string;
}

interface ParticipantTablesProps {
  participants: Participant[];
  greedyParticipants: GreedyParticipant[];
  setShowAddParticipant: (val: boolean) => void;
  setEditingParticipant: (p: Participant | null) => void;
  setNewPlayers: (val: string) => void;
  deleteParticipant: (id: string) => void;
}

export function ParticipantTables({
  participants,
  greedyParticipants,
  setShowAddParticipant,
  setEditingParticipant,
  setNewPlayers,
  deleteParticipant,
}: ParticipantTablesProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
      {/* Main Participants Card */}
      <Card className="border-2 border-[#06051e]/10">
        <CardHeader className="bg-[#06051e] text-white flex flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="text-lg">Main Participants ({participants.length})</CardTitle>
          <Button 
            onClick={() => setShowAddParticipant(true)} 
            className="bg-[#ffba00] hover:bg-[#e0a400] text-[#05041a] h-8 py-0 px-3 flex items-center gap-1 font-bold text-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Participant
          </Button>
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
                        className="h-8 w-8 text-[#06051e]"
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

      {/* Greedy Game Participants Card */}
      <Card className="border-2 border-[#ffba00]/30">
        <CardHeader className="bg-[#ffba00] text-[#05041a]">
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
                  <TableCell className="font-bold text-[#06051e]">{p.name}</TableCell>
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
  );
}
