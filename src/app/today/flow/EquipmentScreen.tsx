"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EquipmentPicker from "../../profile/EquipmentPicker";
import { saveEquipment } from "../../profile/actions";
import QuestionScreen from "./QuestionScreen";

/**
 * "What can you cook with?" — the first time someone cooks and has never said.
 * Asked here, not in first-run setup, so a user who only ever gets food is never
 * asked about a kitchen. Saved to the Profile (editable in Me → Kitchen basics);
 * until it is answered the recommender assumes no appliance at all.
 */
export default function EquipmentScreen({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [items, setItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving || items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveEquipment(items);
      if (result.ok) return onDone();
      setError(result.error === "Pick at least one." ? result.error : "Couldn't save that. Please try again.");
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <QuestionScreen
      stepKey="equipment"
      index={0}
      count={1}
      onBack={onBack}
      title="What can you cook with?"
      hint="Pick everything you have. We'll only suggest meals you can make. You can change this in Me."
      footer={
        <>
          <Button onClick={save} disabled={saving || items.length === 0}>
            {saving ? "Saving…" : "Continue"}
          </Button>
          {error && (
            <p role="alert" className="text-center text-sm text-red-600">
              {error}
            </p>
          )}
        </>
      }
    >
      <EquipmentPicker values={items} onChange={setItems} />
    </QuestionScreen>
  );
}
