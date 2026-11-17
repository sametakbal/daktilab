package auth

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestArgonRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if rehash, err := VerifyPassword("correct horse", h); err != nil || rehash {
		t.Fatalf("verify = %v, %v; want ok without rehash", rehash, err)
	}
	if _, err := VerifyPassword("wrong", h); err != ErrMismatch {
		t.Fatalf("wrong password: err = %v, want ErrMismatch", err)
	}
}

func TestHashesAreSalted(t *testing.T) {
	a, _ := HashPassword("same")
	b, _ := HashPassword("same")
	if a == b {
		t.Fatal("two hashes of the same password are identical")
	}
}

func TestBcryptFromSupabaseNeedsRehash(t *testing.T) {
	h, _ := bcrypt.GenerateFromPassword([]byte("legacy-pass"), bcrypt.MinCost)
	rehash, err := VerifyPassword("legacy-pass", string(h))
	if err != nil || !rehash {
		t.Fatalf("verify = %v, %v; want ok with rehash", rehash, err)
	}
	if _, err := VerifyPassword("nope", string(h)); err != ErrMismatch {
		t.Fatalf("wrong password: err = %v, want ErrMismatch", err)
	}
}

func TestUnknownFormat(t *testing.T) {
	if _, err := VerifyPassword("x", "plaintext"); err == nil {
		t.Fatal("expected an error for an unknown hash format")
	}
}
