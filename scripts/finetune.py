"""
LoRA fine-tuning for ANVIK (Phase 8 — training pipeline).

Unsloth-based, Colab-friendly. Trains an open model on the PII-scrubbed,
thumbs-up golden dataset, exports to GGUF, and registers a candidate in
public.model_versions. Promotion (shadow -> canary -> promoted) is gated by
the evaluation harness in scripts/eval.ts.

Usage (Colab):
    !pip install unsloth transformers trl datasets
    !python scripts/finetune.py --data data/golden.jsonl --base unsloth/llama-3-8b-bnb-4bit

The script is intentionally a scaffold: it wires the dataset, LoRA config and
GGUF export. Hyperparameters and the dataset path are CLI args.
"""
import argparse
import json
import os
import sys


def load_dataset(path: str):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            rows.append({"text": f"User: {obj['question']}\nAssistant: {obj['answer']}"})
    return rows


def main():
    parser = argparse.ArgumentParser(description="ANVIK LoRA fine-tuning (Unsloth)")
    parser.add_argument("--data", required=True, help="PII-scrubbed JSONL dataset")
    parser.add_argument("--base", default="unsloth/llama-3-8b-bnb-4bit", help="Base model")
    parser.add_argument("--output", default="anvik-lora", help="Output dir")
    parser.add_argument("--epochs", type=int, default=1, help="Training epochs")
    parser.add_argument("--rank", type=int, default=16, help="LoRA rank")
    parser.add_argument("--gguf", default="anvik.gguf", help="GGUF export filename")
    args = parser.parse_args()

    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import Dataset
    except ImportError as e:
        print("Missing dependency:", e)
        print("Install with: pip install unsloth transformers trl datasets")
        sys.exit(1)

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=args.rank,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=args.rank,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    rows = load_dataset(args.data)
    dataset = Dataset.from_list(rows)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        dataset_num_proc=2,
        packing=False,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=args.epochs,
            learning_rate=2e-4,
            fp16=True,
            logging_steps=1,
            output_dir=args.output,
            optim="adamw_8bit",
            seed=42,
        ),
    )

    trainer.train()
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)

    # GGUF export for local serving.
    model.save_pretrained_gguf(args.output, tokenizer, quantization_method="q4_k_m")
    print(f"GGUF exported to {args.output}/{args.gguf}")

    # Register a candidate in public.model_versions (service role required).
    print("Register candidate in Supabase model_versions via service role:")
    print(f"  id=anvik-lora-{args.output}, base_model={args.base}, status=candidate")
    print("Promotion (shadow -> canary -> promoted) is gated by scripts/eval.ts.")


if __name__ == "__main__":
    main()
