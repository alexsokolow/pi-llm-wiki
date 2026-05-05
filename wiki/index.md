# Wiki Index

## Sources
- [[Attention Is All You Need]] — Landmark 2017 paper introducing the Transformer architecture (Vaswani et al.)

## Entities
- [[Ashish Vaswani]] — Lead author of "Attention Is All You Need", Google Brain researcher
- [[Google Brain]] — Research division at Google, primary affiliation for Transformer paper authors
- [[Google Research]] — Research division at Google, affiliation for several Transformer paper co-authors

## Concepts
- [[Transformer Architecture]] — Novel architecture based entirely on attention mechanisms, dispensing with recurrence and convolutions
- [[Self-Attention]] — Mechanism relating different positions of a single sequence to compute a representation
- [[Multi-Head Attention]] — Parallel attention layers (heads) attending to different representation subspaces
- [[Scaled Dot-Product Attention]] — Core attention function: softmax(QK^T/√d_k)V
- [[Positional Encoding]] — Sinusoidal functions injecting sequence order information into the model
- [[Encoder-Decoder Architecture]] — Pattern where encoder maps input to representations and decoder generates output
- [[Neural Machine Translation]] — Using neural networks to translate text between languages
- [[Residual Connections]] — Skip connections around sublayers enabling deep network training
- [[Layer Normalization]] — Normalization technique applied after each residual connection
- [[Feed-Forward Network]] — Position-wise fully connected layers (two linear + ReLU) in each Transformer layer
- [[Masked Attention]] — Decoder self-attention masking to prevent attending to future positions
- [[Label Smoothing]] — Regularization technique redistributing probability mass (ε=0.1)
- [[Warmup Learning Rate Schedule]] — Linear warmup then inverse-sqrt decay learning rate schedule
- [[Byte-Pair Encoding]] — Subword tokenization method for handling open vocabulary
- [[Beam Search]] — Heuristic decoding strategy maintaining top-k partial sequences
- [[Sequence-to-Sequence Learning]] — General framework for variable-length input-to-output sequence mapping

## Syntheses
_(none yet)_
