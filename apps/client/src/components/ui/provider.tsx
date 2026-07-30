"use client"

import { createSystem, defaultConfig } from "@chakra-ui/react"

void createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Roboto" },
        body: { value: "Roboto" },
      },
    },
  },
})
