// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// biz_rebac_schema.go is the sole bridge between the ReBAC module and
// github.com/openfga/language/pkg/go/transformer (spec §5 DSL, §13 Always).
//
// All DSL parsing MUST go through this file — no other file in the object
// package should import the transformer package directly.

package object

import (
	"fmt"

	openfgav1 "github.com/openfga/api/proto/openfga/v1"
	transformer "github.com/openfga/language/pkg/go/transformer"
	"google.golang.org/protobuf/encoding/protojson"
)

// ParsedSchema keeps all three representations in sync: DSL (display),
// Proto (Check-time walks), JSON (persistence / external SDKs).
type ParsedSchema struct {
	DSL   string
	Proto *openfgav1.AuthorizationModel
	JSON  string
}

// ParseSchemaDSL parses an OpenFGA DSL string and returns a ParsedSchema
// containing DSL, Proto, and JSON representations. Returns an error if
// the DSL is empty or syntactically invalid.
func ParseSchemaDSL(dsl string) (*ParsedSchema, error) {
	if dsl == "" {
		return nil, fmt.Errorf("schema DSL is empty")
	}

	proto, err := transformer.TransformDSLToProto(dsl)
	if err != nil {
		return nil, fmt.Errorf("parse DSL: %w", err)
	}

	jsonBytes, err := protojson.Marshal(proto)
	if err != nil {
		return nil, fmt.Errorf("marshal schema JSON: %w", err)
	}

	return &ParsedSchema{
		DSL:   dsl,
		Proto: proto,
		JSON:  string(jsonBytes),
	}, nil
}

// RenderSchemaFromProto converts an AuthorizationModel proto back to DSL text.
// Returns an error if proto is nil or rendering fails.
//
// Note: the proto is normalised through a JSON round-trip before rendering.
// TransformDSLToProto builds the proto via an ANTLR listener that can leave
// internal protobuf field-presence bits in a state that causes
// TransformJSONProtoToDSL to reject bare `this:{}` usersets. Marshalling to
// JSON and unmarshalling again (LoadJSONStringToProto) resets field presence
// consistently, making every valid proto renderable.
func RenderSchemaFromProto(proto *openfgav1.AuthorizationModel) (string, error) {
	if proto == nil {
		return "", fmt.Errorf("nil proto")
	}

	// Normalise proto field-presence via JSON round-trip (see note above).
	jsonBytes, err := protojson.Marshal(proto)
	if err != nil {
		return "", fmt.Errorf("render DSL: marshal normalisation: %w", err)
	}

	normalised, err := transformer.LoadJSONStringToProto(string(jsonBytes))
	if err != nil {
		return "", fmt.Errorf("render DSL: unmarshal normalisation: %w", err)
	}

	dsl, err := transformer.TransformJSONProtoToDSL(normalised)
	if err != nil {
		return "", fmt.Errorf("render DSL: %w", err)
	}

	return dsl, nil
}

// ParseSchemaJSON unmarshals a protojson-encoded AuthorizationModel from a
// JSON string. Returns an error if the string is empty or invalid.
func ParseSchemaJSON(jsonText string) (*openfgav1.AuthorizationModel, error) {
	if jsonText == "" {
		return nil, fmt.Errorf("schema JSON is empty")
	}

	var proto openfgav1.AuthorizationModel
	if err := protojson.Unmarshal([]byte(jsonText), &proto); err != nil {
		return nil, fmt.Errorf("unmarshal schema JSON: %w", err)
	}

	return &proto, nil
}

// ExtractRelationKeys returns all relation keys from the model in the form
// "objectType#relation". Map iteration order is non-deterministic, so the
// returned slice is unordered. Callers that need membership checks should
// convert to a set. Returns nil if proto is nil.
func ExtractRelationKeys(proto *openfgav1.AuthorizationModel) []string {
	if proto == nil {
		return nil
	}

	var keys []string
	for _, td := range proto.GetTypeDefinitions() {
		typeName := td.GetType()
		for relation := range td.GetRelations() {
			keys = append(keys, typeName+"#"+relation)
		}
	}

	return keys
}

// ExtractTypeNames returns the type names defined in the model, in the same
// order they appear in the type definitions list. Returns nil if proto is nil.
func ExtractTypeNames(proto *openfgav1.AuthorizationModel) []string {
	if proto == nil {
		return nil
	}

	tds := proto.GetTypeDefinitions()
	names := make([]string, 0, len(tds))
	for _, td := range tds {
		names = append(names, td.GetType())
	}

	return names
}
