"""Stratified VAE — PyTorch implementation matched to the v3 Keras specification.

TensorFlow has no Python 3.14 wheel, so the model is reimplemented in PyTorch.
Architecture, loss terms, Free Bits clamp, beta schedule, optimiser and the
early-stopping rule are matched to v3; Glorot-uniform init reproduces the Keras
default initialiser.
"""

from __future__ import annotations

import math
import time

import numpy as np
import torch
import torch.nn as nn

DEVICE = torch.device("cpu")


# --------------------------------------------------------------------------
# scaling
# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------
def _glorot(layer: nn.Linear) -> None:
    nn.init.xavier_uniform_(layer.weight)
    nn.init.zeros_(layer.bias)


class VAE(nn.Module):
    def __init__(self, input_dim: int, h1: int, h2: int, latent: int, free_bits: float):
        super().__init__()
        self.free_bits = float(free_bits)
        self.latent = latent
        self.e1, self.e2 = nn.Linear(input_dim, h1), nn.Linear(h1, h2)
        self.mu, self.lv = nn.Linear(h2, latent), nn.Linear(h2, latent)
        self.d1, self.d2 = nn.Linear(latent, h2), nn.Linear(h2, h1)
        self.out = nn.Linear(h1, input_dim)
        for m in [self.e1, self.e2, self.mu, self.lv, self.d1, self.d2, self.out]:
            _glorot(m)

    def encode(self, x):
        h = torch.relu(self.e2(torch.relu(self.e1(x))))
        return self.mu(h), self.lv(h)

    def decode(self, z):
        return torch.sigmoid(self.out(torch.relu(self.d2(torch.relu(self.d1(z))))))

    def losses(self, x):
        mu, lv = self.encode(x)
        z = mu + torch.exp(0.5 * lv) * torch.randn_like(mu)
        recon = self.decode(z)
        recon_loss = torch.sum((x - recon) ** 2, dim=1).mean()
        kl_pd = -0.5 * (1 + lv - mu**2 - torch.exp(lv))
        kl_raw = kl_pd.sum(dim=1).mean()
        kl_loss = torch.clamp(kl_pd, min=self.free_bits).sum(dim=1).mean()
        return recon_loss, kl_loss, kl_raw


def train_vae(
    X_fit: np.ndarray, X_val: np.ndarray, arch: dict, *,
    free_bits: float = 0.1, beta_max: float = 0.05, anneal_epochs: int = 10,
    epochs: int = 60, batch_size: int = 256, patience: int = 8,
    start_from_epoch: int = 12, lr: float = 1e-3, seed: int = 42, log=print,
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    model = VAE(X_fit.shape[1], arch["h1"], arch["h2"], arch["latent"], free_bits).to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    Xt = torch.from_numpy(X_fit)
    Xv = torch.from_numpy(X_val)
    n = len(Xt)
    steps = math.ceil(n / batch_size)

    best, best_state, wait, stopped = math.inf, None, 0, epochs
    t0 = time.time()
    for ep in range(epochs):
        beta = min(beta_max, beta_max * ep / anneal_epochs)
        model.train()
        perm = torch.randperm(n)
        for i in range(steps):
            xb = Xt[perm[i * batch_size:(i + 1) * batch_size]]
            recon, kl, _ = model.losses(xb)
            loss = recon + beta * kl
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()

        model.eval()
        with torch.no_grad():
            vr, vk, vkr = [], [], []
            for i in range(0, len(Xv), 8192):
                r, k, kr = model.losses(Xv[i:i + 8192])
                m = min(8192, len(Xv) - i)
                vr.append(r.item() * m); vk.append(k.item() * m); vkr.append(kr.item() * m)
            val_recon = sum(vr) / len(Xv)
            val_kl_raw = sum(vkr) / len(Xv)

        # Keras semantics: monitoring does not begin until start_from_epoch.
        # Before that epoch neither `best` nor `wait` is updated at all, so the
        # earliest possible stop is start_from_epoch + patience.
        if ep < start_from_epoch:
            continue
        if val_recon < best - 1e-9:
            best, wait = val_recon, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            wait += 1
            if wait >= patience:
                stopped = ep + 1
                break

    if best_state is not None:
        model.load_state_dict(best_state)
    el = time.time() - t0
    log(f"      {stopped} epochs, {el:.1f}s, val_recon {best:.5f}, val_kl_raw {val_kl_raw:.3f}")
    return model, {"epochs_run": stopped, "seconds": el,
                   "val_recon_loss": float(best), "val_kl_raw": float(val_kl_raw)}
