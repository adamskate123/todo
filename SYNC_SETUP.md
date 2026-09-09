# Setting up Device Sync

This connects the app across your devices. It takes about five minutes, once.

## What this does, and what it does not do

Your tasks live on your device. When sync is on, the app **encrypts them in your
browser** and stores the encrypted blob in a private GitHub repository. GitHub
holds ciphertext it has no way to read.

Two things are worth being clear about before you start:

- **Clinical tasks are never uploaded.** Anything you file under the *Clinical*
  category stays only on the device where you created it. It is excluded from
  the upload entirely, not merely encrypted.
- **The encryption protects your data on GitHub.** It does not protect against
  someone using your already-unlocked laptop, who could simply open the app.

GitHub will not sign a Business Associate Agreement. If you are considering
putting anything patient-identifiable into the categories that *do* sync, check
with your institution's privacy office first.

## Step 1 — Create a private repository

1. Go to <https://github.com/new>
2. **Repository name:** `medtodo-sync`
3. Select **Private**. This matters — do not leave it public.
4. Tick **Add a README file**. This gives the repo an initial commit, which the
   app needs in order to write to it.
5. Click **Create repository**

## Step 2 — Create an access token

1. Go to <https://github.com/settings/personal-access-tokens>
2. Click **Generate new token**
3. **Token name:** `medtodo sync`
4. **Expiration:** your choice. When it expires, sync stops and you generate a
   new one and reconnect — no data is lost.
5. **Repository access:** choose **Only select repositories**, then pick
   `medtodo-sync`. Do not grant access to all repositories.
6. Under **Permissions → Repository permissions**, find **Contents** and set it
   to **Read and write**. Leave everything else alone.
7. Click **Generate token** and copy it. GitHub shows it only once.

## Step 3 — Connect your first device

Open the app and find the **Device Sync** card.

| Field | What to enter |
| --- | --- |
| GitHub username | your username, e.g. `adamskate123` |
| Private repo name | `medtodo-sync` |
| Access token | the token you just copied |
| Passphrase | a phrase you choose — see below |

Click **Connect this device**.

### Choosing the passphrase

This is what your data is encrypted with. It is **not** your GitHub password,
and it is never sent anywhere.

- Use the **same passphrase on every device**, or they will not be able to read
  each other's data.
- **It cannot be reset.** Nobody can recover it — not GitHub, not this app. If
  you lose it, the synced copy is unreadable and you would start over from the
  tasks still on your devices.
- Write it down somewhere you keep other important credentials.

## Step 4 — Connect your other devices

On each additional device, repeat Step 3 with the **same** username, repo,
token, and passphrase.

The first sync merges both sides rather than one overwriting the other. If you
mistype the passphrase, the app refuses to connect and tells you so, instead of
silently creating a second, separate set of data.

## Everyday use

Sync runs on its own — when you open the app, when you return to the tab, and a
few seconds after you change something. **Sync now** forces it. The card shows
the last sync time.

Offline is fine. Changes save locally and go up next time you have a connection.

## If two devices change the same task

The more recent edit wins, per task. Deletes are timestamped the same way, so a
task you delete on your laptop will not reappear from your phone's older copy.
Tasks that only exist on one device are always kept.

## Turning it off

**Disconnect this device** removes the token and encryption key from that
browser. Your tasks stay on the device, and the synced copy is left alone.

## If something goes wrong

| Message | What it means |
| --- | --- |
| *GitHub rejected the token* | The token expired or was revoked. Generate a new one and reconnect. |
| *GitHub refused the request* | The token is missing **Contents: Read and write** for this repo. |
| *Repository not found* | Check the username and repo name, and that the token lists this repo under its access. |
| *The passphrase does not match* | This device used a different passphrase than the one the data was encrypted with. |
| *Offline* | No connection. Your tasks are safe locally and will sync later. |

## A note on reclassifying tasks

If you move a task into *Clinical* after it has already synced, the app stops
uploading it and removes it from the current synced copy. But the repository
keeps its git history, so the earlier version remains in past commits. If that
matters, delete the `medtodo-sync` repository and reconnect to start a fresh
history.
