// Command import-words loads a one-word-per-line dictionary into the words table.
//
//	DATABASE_URL=postgres://… go run ./cmd/import-words <tr|en> <file>
//
// Words are lowercased with the language's rules (Turkish I → ı), deduplicated, and filtered
// to 2–20 letters. The language's previous words are replaced atomically, so it is safe to re-run.
package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/sametakbal/daktilab/server/internal/db"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"golang.org/x/text/unicode/norm"
)

var letters = map[string]*regexp.Regexp{
	"tr": regexp.MustCompile(`^[a-zçğıöşü]+$`),
	"en": regexp.MustCompile(`^[a-z]+$`),
}

const (
	minLen = 2
	maxLen = 20
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "import-words:", err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) != 3 || letters[os.Args[1]] == nil {
		return fmt.Errorf("usage: import-words <tr|en> <file>")
	}
	lang, path := os.Args[1], os.Args[2]
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return fmt.Errorf("DATABASE_URL must be set")
	}

	start := time.Now()
	words, err := readWords(lang, path)
	if err != nil {
		return err
	}
	fmt.Printf("%s: %d unique words after cleaning\n", lang, len(words))

	ctx := context.Background()
	pool, err := db.Open(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}

	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "delete from words where lang = $1", lang); err != nil {
			return err
		}
		_, err := tx.CopyFrom(ctx, pgx.Identifier{"words"}, []string{"lang", "n", "word"},
			pgx.CopyFromSlice(len(words), func(i int) ([]any, error) {
				return []any{lang, i + 1, words[i]}, nil
			}))
		return err
	})
	if err != nil {
		return err
	}
	fmt.Printf("%s: done in %s\n", lang, time.Since(start).Round(time.Millisecond))
	return nil
}

// readWords returns the cleaned words in first-seen order.
func readWords(lang, path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	lower := cases.Lower(language.Make(lang))
	seen := map[string]bool{}
	var words []string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		w := lower.String(norm.NFC.String(strings.TrimSpace(sc.Text())))
		if n := utf8.RuneCountInString(w); n < minLen || n > maxLen || !letters[lang].MatchString(w) || seen[w] {
			continue
		}
		seen[w] = true
		words = append(words, w)
	}
	return words, sc.Err()
}
