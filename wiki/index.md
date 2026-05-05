# Wiki Index

## Sources
- [[Attention Is All You Need]] — Landmark 2017 paper introducing the Transformer architecture based solely on attention mechanisms

## Entities
- [[Ashish Vaswani]] — Google Brain researcher; lead author, designed/implemented first Transformer models
- [[Noam Shazeer]] — Google Brain researcher; proposed scaled dot-product and multi-head attention
- [[Jakob Uszkoreit]] — Google Research; proposed replacing RNNs with self-attention
- [[Google Brain]] — Primary research lab affiliation for Transformer authors
- [[Google Research]] — Secondary research lab affiliation for Transformer authors
- [[tensor2tensor]] — Open-source training/evaluation framework for the Transformer
- [[WMT 2014]] — Machine translation benchmark (EN-DE 28.4 BLEU, EN-FR 41.8 BLEU)

## Concepts
- [[Transformer]] — Sequence transduction architecture based solely on attention, no recurrence/convolution
- [[Self-Attention]] — Mechanism relating different positions of a single sequence for representation
- [[Multi-Head Attention]] — Parallel attention heads with learned linear projections
- [[Scaled Dot-Product Attention]] — Core attention function: softmax(QK^T/√d_k)V
- [[Positional Encoding]] — Sinusoidal functions encoding token position in lieu of recurrence
- [[Encoder-Decoder Architecture]] — N=6 identical stacked layers on encoder and decoder sides
- [[Masked Attention]] — Prevents leftward information flow in decoder for autoregressive generation
- [[Warmup Learning Rate]] — Linear warmup then inverse-sqrt decay optimization schedule

## Syntheses
_(none yet)_
