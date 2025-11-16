# Git Commands for Updating Repository

## On Your Local Machine (Windows)

### 1. Navigate to your project directory
```bash
cd C:\Users\shyam\Documents\Dev\sol-emp-accomodation
```

### 2. Check current status
```bash
git status
```

### 3. Add all changes
```bash
git add .
```

### 4. Commit changes
```bash
git commit -m "Add responsive UI refactor and remove Monthly Rent Spend chart"
```

### 5. Push to GitHub
```bash
git push origin main
```

(If your default branch is `master` instead of `main`, use: `git push origin master`)

---

## On Ubuntu VM (After Initial Setup)

### First Time - Clone Repository
```bash
cd /home/soliflexuser/accomodation
git clone https://github.com/AI-APP-FREELANCER/new-soliflex-employee-accomodation-app.git sol-emp-accomodation
```

### Future Updates - Pull Latest Code
```bash
cd /home/soliflexuser/accomodation/sol-emp-accomodation
git pull origin main
```

(Then run `./refresh.sh` to rebuild and restart the app)

