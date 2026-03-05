const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0NDY5N2E4YjkxYjY5MzM1MjkxMjI5MDQ2YzU5NjE0OSIsIm5iZiI6MTc3MjYwNDM5OS41ODQsInN1YiI6IjY5YTdjYmVmM2UzYTNhYjYxZDNkMTY1NCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.1QRzTWYKxjOfuNBjKGBVhqbaoM2zUAq9Z7_ejUyjjtc"; // paste your token here

export const TMDB_BASE = "https://api.themoviedb.org/3";

export const tmdbHeaders = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  "Content-Type": "application/json"
};