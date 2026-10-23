git remote add origin https://github.com/mohxmedishan/8cm-app.git
git branch -M main
git pull origin main --allow-unrelated-histories
git rm -rf .
git commit -m "Wipe out all old files for fresh redesign"
git push origin main
git commit -m "Wipe out all old files for fresh redesign"
git push origin main
git config --global user.name "Mohamed Ishan"
git config --global user.email "mohamedishankunnummal@gmail.com"
git commit -m "Wipe out all old files for fresh redesign"
git push origin main
find . -mindepth 1 -maxdepth 1 ! -name '.git' ! -name 'assets' -exec rm -rf {} +
git add -A
git commit -m "Wipe project files but keep assets folder"
git push origin main
