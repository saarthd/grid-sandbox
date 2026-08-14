# GridLab Electrical Simulator

GridLab is a browser-based electrical grid simulator for building and running 10 kV distribution and 100 kV transmission networks. It supports sources, loads, batteries, substations, poles, towers, line protection, import/export, multi-selection, and one-second runtime simulation.

The project is a static site with no build step or server-side dependencies.

## Run locally

From this directory, start any static file server. For example:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Project files

- `index.html`: application structure and controls
- `styles.css`: layout and visual design
- `app.js`: canvas editor, grid solver, runtime simulation, and JSON compatibility

Grid files exported by the simulator are user data and do not need to be committed to the repository.

## First GitHub publication

Create an empty repository on GitHub without adding a README or `.gitignore`, then run:

```powershell
git init
git add index.html styles.css app.js README.md .gitignore
git commit -m "Publish GridLab electrical simulator"
git branch -M main
git remote add origin https://github.com/USERNAME/gridlab.git
git push -u origin main
```

Replace `USERNAME` and `gridlab` with the GitHub account and repository name.

## Publish with GitHub Pages

In the repository on GitHub:

1. Open **Settings** and then **Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder.
4. Save and wait for the deployment to complete.

The site will be available at `https://USERNAME.github.io/REPOSITORY/`. All application assets use relative paths, so no code changes are required for a project Pages URL.

## Upload future updates

After editing and testing the simulator:

```powershell
git status
git add index.html styles.css app.js README.md .gitignore
git commit -m "Update GridLab simulation behavior"
git push
```

GitHub Pages will redeploy automatically after the push reaches `main`. Use `git remote -v` to confirm the destination before the first push from a new machine.
