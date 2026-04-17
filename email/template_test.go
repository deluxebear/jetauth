package email

import "testing"

func TestRender_JSONEscapesQuotes(t *testing.T) {
	ctx := Context{FromAddress: "a@b.c", Subject: `He said "hi"`, Content: "line1\nline2"}
	out, err := Render(`{"from":"${fromAddress}","subject":"${subject}","html":"${content}"}`, "application/json", ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"from":"a@b.c","subject":"He said \"hi\"","html":"line1\nline2"}`
	if out != want {
		t.Fatalf("got %q\nwant %q", out, want)
	}
}

func TestRender_FormURLEncodes(t *testing.T) {
	ctx := Context{Subject: "a b&c", Content: "hello world"}
	out, err := Render(`subject=${subject}&body=${content}`, "application/x-www-form-urlencoded", Context{Subject: ctx.Subject, Content: ctx.Content})
	if err != nil {
		t.Fatal(err)
	}
	want := `subject=a+b%26c&body=hello+world`
	if out != want {
		t.Fatalf("got %q\nwant %q", out, want)
	}
}

func TestRender_ToAddressesArrayInJSON(t *testing.T) {
	ctx := Context{ToAddresses: []string{"x@y.com", "z@y.com"}}
	out, err := Render(`{"to":${toAddresses}}`, "application/json", ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"to":["x@y.com","z@y.com"]}`
	if out != want {
		t.Fatalf("got %q want %q", out, want)
	}
}

func TestRender_RejectsUnknownPlaceholder(t *testing.T) {
	_, err := Render(`${mystery}`, "application/json", Context{})
	if err == nil {
		t.Fatal("expected error for unknown placeholder")
	}
}
