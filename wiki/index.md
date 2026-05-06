# Wiki Index

## Sources
- [[Attention Is All You Need]] — Foundational paper introducing the Transformer architecture (Vaswani et al., NIPS 2017)

## Entities
- [[Aidan N. Gomez]] — Equal-contribution co-author, designed Tensor2Tensor framework (University of Toronto)
- [[Ashish Vaswani]] — Equal-contribution first author, designed first Transformer models (Google Brain)
- [[Google Brain]] — Deep-learning research team at Google, institutional home of the Transformer
- [[Illia Polosukhin]] — Equal-contribution co-author, implemented first Transformer models (Google Research)
- [[Jakob Uszkoreit]] — Proposed replacing RNNs with self-attention, originated the Transformer concept (Google Research)
- [[Llion Jones]] — Equal-contribution co-author, initial codebase and efficient inference (Google Research)
- [[Łukasz Kaiser]] — Equal-contribution co-author, Tensor2Tensor implementation (Google Brain)
- [[Niki Parmar]] — Equal-contribution co-author, model tuning and ablations (Google Research)
- [[Noam Shazeer]] — Equal-contribution co-author, proposed multi-head attention and scaled dot-product attention (Google Brain)

## Concepts
- [[Byte-Pair Encoding]] — Subword tokenization used for shared source-target vocabulary (~37K tokens)
- [[Encoder-Decoder Transformer]] — Specific encoder-decoder configuration for sequence transduction
- [[Layer Normalization]] — Stabilization technique applied around every Transformer sub-layer
- [[Multi-Head Attention]] — Parallel attention mechanism with h=8 heads, d_k=64 per head
- [[Positional Encoding]] — Sinusoidal position representation injected into input embeddings
- [[Scaled Dot-Product Attention]] — Attention(Q,K,V) = softmax(QK^T / √d_k)V, with scaling for stability
- [[Self-Attention]] — Relating different positions of a single sequence; core idea replacing recurrence
- [[Transformer Architecture]] — First sequence transduction model based entirely on attention (no recurrence)

## Syntheses
_(none yet)_
