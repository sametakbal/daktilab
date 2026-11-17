// Package auth holds password hashing and session token helpers.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// OWASP's recommended argon2id baseline: 19 MiB, 2 iterations, 1 lane.
const (
	argonMemory  = 19 * 1024
	argonTime    = 2
	argonThreads = 1
	argonKeyLen  = 32
	saltLen      = 16
)

var ErrMismatch = errors.New("password does not match")

// HashPassword returns an argon2id PHC string: $argon2id$v=19$m=…,t=…,p=…$salt$hash.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// VerifyPassword checks a password against an argon2id hash, or a bcrypt hash imported from Supabase.
// needsRehash reports that the stored hash should be replaced with a fresh HashPassword result.
func VerifyPassword(password, encoded string) (needsRehash bool, err error) {
	switch {
	case strings.HasPrefix(encoded, "$argon2id$"):
		return verifyArgon(password, encoded)
	case strings.HasPrefix(encoded, "$2a$"), strings.HasPrefix(encoded, "$2b$"), strings.HasPrefix(encoded, "$2y$"):
		if err := bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)); err != nil {
			return false, ErrMismatch
		}
		return true, nil
	default:
		return false, errors.New("unknown password hash format")
	}
}

func verifyArgon(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$") // "", "argon2id", "v=19", "m=…,t=…,p=…", salt, hash
	if len(parts) != 6 {
		return false, errors.New("malformed argon2id hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("unsupported argon2 version")
	}
	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, errors.New("malformed argon2id parameters")
	}
	b64 := base64.RawStdEncoding
	salt, err := b64.DecodeString(parts[4])
	if err != nil {
		return false, errors.New("malformed argon2id salt")
	}
	want, err := b64.DecodeString(parts[5])
	if err != nil {
		return false, errors.New("malformed argon2id key")
	}
	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return false, ErrMismatch
	}
	stale := memory != argonMemory || time != argonTime || threads != argonThreads || len(want) != argonKeyLen
	return stale, nil
}

// dummyHash lets a login for an unknown email cost as much as a real one (no user enumeration by timing).
var dummyHash, _ = HashPassword("not-a-real-password")

func BurnVerify(password string) { _, _ = VerifyPassword(password, dummyHash) }

// NewSessionToken returns a random cookie token and the hash stored in the database.
func NewSessionToken() (token string, hash []byte, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// RandomString is a URL-safe random value for OAuth state and similar one-off secrets.
func RandomString() string {
	raw := make([]byte, 24)
	_, _ = rand.Read(raw)
	return base64.RawURLEncoding.EncodeToString(raw)
}
