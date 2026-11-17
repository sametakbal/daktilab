package api

import (
	"sync"
	"time"
)

// rateLimiter is a fixed-window, per-key counter kept in memory (one instance; fine for a single server).
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string]*window
	now    func() time.Time
}

type window struct {
	start time.Time
	count int
}

func newRateLimiter(limit int, per time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: per, hits: map[string]*window{}, now: time.Now}
}

func (l *rateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.hits) > 10_000 { // drop stale windows so the map can't grow without bound
		for k, w := range l.hits {
			if now.Sub(w.start) >= l.window {
				delete(l.hits, k)
			}
		}
	}
	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) >= l.window {
		l.hits[key] = &window{start: now, count: 1}
		return true
	}
	if w.count >= l.limit {
		return false
	}
	w.count++
	return true
}
